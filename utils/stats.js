// 방문 통계 모아서 저장하기
//
// 예전에는 방문·클릭이 있을 때마다 통계 전체를 읽고 → 숫자 하나 바꾸고 → 전체를 다시
// 저장했습니다. 그래서
//   1) 거의 동시에 들어온 기록끼리 서로 덮어써서 숫자가 빠지고,
//   2) 통계가 쌓일수록 매번 저장하는 양이 커져서 느려지는 문제가 있었습니다.
//
// 이제는 기록을 서버 메모리에 모아두었다가 30초마다(또는 많이 쌓이면 바로) 한 번에
// 저장하고, 저장할 때 오래된 기록을 정리합니다. 관리자 통계 화면은 가장 긴 범위가
// 최근 30일이라, 여유 있게 아래 기간만 보관합니다.
//   - 페이지 방문 수(pageviews): 400일
//   - 그 외 세부 기록(클릭·항목별·체류시간·기기별): 180일

const { updateData } = require('./db');

const FLUSH_INTERVAL_MS = 30 * 1000;
const FLUSH_WHEN_PENDING = 300;
const KEEP_DAYS_PAGEVIEWS = 400;
const KEEP_DAYS_DETAIL = 180;

let pending = [];
let flushing = null;

function cleanStr(v, max) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function emptyDeviceBucket() {
  return { pageviews: 0, timeSpentSeconds: 0, timeSpentSessions: 0 };
}

// 들어온 기록을 검사해서 모아둠. 형식이 잘못되면 false
function record(body) {
  const type = body.type;
  const dev = body.device === 'mobile' ? 'mobile' : 'desktop'; // PC/모바일 두 가지로만 단순화
  const day = new Date().toISOString().slice(0, 10);
  // 경로는 '/'로 시작하는 짧은 주소만 받음 (아무 값이나 넣어 통계를 부풀리는 것 방지)
  const path = cleanStr(body.path, 120);
  const validPath = path.startsWith('/') ? path : '';

  if (type === 'pageview' && validPath) {
    pending.push({ type, day, dev, path: validPath });
  } else if (type === 'click' && cleanStr(body.label, 60)) {
    pending.push({
      type, day, dev,
      label: cleanStr(body.label, 60),
      itemType: cleanStr(body.itemType, 40),
      itemId: cleanStr(body.itemId, 100),
      itemTitle: cleanStr(body.itemTitle, 150)
    });
  } else if (type === 'timespent' && validPath && body.seconds) {
    // 비정상적으로 큰 값(방치된 탭 등)이 통계를 왜곡하지 않도록 최대 1시간으로 제한
    const sec = Math.min(Number(body.seconds) || 0, 3600);
    if (sec >= 1) pending.push({ type, day, dev, path: validPath, sec });
  } else {
    return false;
  }
  if (pending.length >= FLUSH_WHEN_PENDING) flush();
  return true;
}

function applyEvent(stats, e) {
  if (e.type === 'pageview') {
    stats.pageviews[e.day] = stats.pageviews[e.day] || {};
    stats.pageviews[e.day][e.path] = (stats.pageviews[e.day][e.path] || 0) + 1;
    stats.deviceStats[e.day] = stats.deviceStats[e.day] || { desktop: emptyDeviceBucket(), mobile: emptyDeviceBucket() };
    stats.deviceStats[e.day][e.dev].pageviews += 1;
  } else if (e.type === 'click') {
    stats.clicks[e.day] = stats.clicks[e.day] || {};
    stats.clicks[e.day][e.label] = (stats.clicks[e.day][e.label] || 0) + 1;
    // 어떤 항목(영상 하나하나, 게시글 하나하나 등)을 눌렀는지도 같이 기록
    if (e.itemType && e.itemId) {
      stats.itemClicks[e.day] = stats.itemClicks[e.day] || {};
      stats.itemClicks[e.day][e.itemType] = stats.itemClicks[e.day][e.itemType] || {};
      const bucket = stats.itemClicks[e.day][e.itemType];
      if (!bucket[e.itemId]) bucket[e.itemId] = { count: 0, title: e.itemTitle || '' };
      bucket[e.itemId].count += 1;
      if (e.itemTitle) bucket[e.itemId].title = e.itemTitle;
    }
  } else if (e.type === 'timespent') {
    stats.timeSpent[e.day] = stats.timeSpent[e.day] || {};
    stats.timeSpent[e.day][e.path] = stats.timeSpent[e.day][e.path] || { totalSeconds: 0, sessions: 0 };
    stats.timeSpent[e.day][e.path].totalSeconds += e.sec;
    stats.timeSpent[e.day][e.path].sessions += 1;
    stats.deviceStats[e.day] = stats.deviceStats[e.day] || { desktop: emptyDeviceBucket(), mobile: emptyDeviceBucket() };
    stats.deviceStats[e.day][e.dev].timeSpentSeconds += e.sec;
    stats.deviceStats[e.day][e.dev].timeSpentSessions += 1;
  }
}

function pruneOld(stats) {
  const cutoff = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const prune = (obj, days) => {
    if (!obj) return;
    const c = cutoff(days);
    Object.keys(obj).forEach((day) => { if (day < c) delete obj[day]; });
  };
  prune(stats.pageviews, KEEP_DAYS_PAGEVIEWS);
  prune(stats.clicks, KEEP_DAYS_DETAIL);
  prune(stats.itemClicks, KEEP_DAYS_DETAIL);
  prune(stats.timeSpent, KEEP_DAYS_DETAIL);
  prune(stats.deviceStats, KEEP_DAYS_DETAIL);
}

// 모아둔 기록을 한 번에 저장
function flush() {
  if (flushing) return flushing.then(() => (pending.length ? flush() : undefined));
  if (pending.length === 0) return Promise.resolve();
  const batch = pending;
  pending = [];
  flushing = updateData('stats', (current) => {
    const stats = current || { pageviews: {}, clicks: {} };
    if (!stats.pageviews) stats.pageviews = {};
    if (!stats.clicks) stats.clicks = {};
    if (!stats.itemClicks) stats.itemClicks = {};
    if (!stats.timeSpent) stats.timeSpent = {};
    if (!stats.deviceStats) stats.deviceStats = {};
    batch.forEach((e) => applyEvent(stats, e));
    pruneOld(stats);
    return stats;
  })
    .catch((err) => {
      console.error('통계 저장 실패:', err.message);
      pending = batch.concat(pending); // 다음 번에 다시 시도
    })
    .finally(() => { flushing = null; });
  return flushing;
}

setInterval(flush, FLUSH_INTERVAL_MS).unref();

// 서버가 재시작·배포로 꺼질 때 남은 기록을 저장하고 종료
let exiting = false;
['SIGTERM', 'SIGINT'].forEach((sig) => {
  process.once(sig, () => {
    if (exiting) return;
    exiting = true;
    const done = () => process.exit(0);
    Promise.race([flush(), new Promise((r) => setTimeout(r, 5000))]).then(done, done);
  });
});

module.exports = { record, flush };
