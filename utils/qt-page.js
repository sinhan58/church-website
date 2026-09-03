const { getFontStyleAndLinks } = require('./font-catalog');

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(str = '') {
  return escapeHtml(str).replace(/\n/g, '<br>');
}

function formatDateLabel(dateStr = '') {
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

// 아멘 개수에 따라 뱃지 단계를 정합니다. (숫자는 절대 노출하지 않고, 문구/아이콘만 바뀝니다)
function getQtAmenTier(amen) {
  const n = amen || 0;
  if (n <= 0) return null;
  if (n === 1) return { level: 1, icon: '🙏', label: '첫 아멘이 도착했어요' };
  if (n <= 5) return { level: 2, icon: '💛', label: '은혜를 나누고 있어요' };
  if (n <= 9) return { level: 3, icon: '✨', label: '은혜가 번지고 있어요' };
  if (n <= 14) return { level: 4, icon: '🔥', label: '뜨거운 은혜의 시간' };
  return { level: 5, icon: '🎉', label: '전교인 큐티 참여 완료' };
}

function renderQtAmenBadgeHtml(amen) {
  const tier = getQtAmenTier(amen);
  if (!tier) return '<span class="qt-amen-badge" id="qt-amen-badge" style="display:none;"></span>';
  return `<span class="qt-amen-badge qt-amen-badge--lv${tier.level}" id="qt-amen-badge"><span class="qt-amen-badge-heart">♥</span> ${tier.label}</span>`;
}

// 큐티 상세 페이지 전체 HTML을 문자열로 만들어 돌려줍니다.
// 검색엔진이 자바스크립트 실행 없이도 그날의 큐티 내용을 온전히 읽을 수 있도록 서버에서 직접 렌더링합니다.
function renderQtDetailPage({ site, item, prev, next, siteUrl }) {
  const churchName = site.churchName || '교회';
  const pastor = item.pastor || site.about?.pastorName || '';
  const pageTitle = `${item.title || '오늘의 큐티'} | ${churchName} 오늘의 큐티`;
  const description = (item.body || item.verseText || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const pageUrl = `${siteUrl}/qt/${item.id}`;
  const ogImage = site.about?.image || `${siteUrl}/uploads/0001.png`;

  // 관리자가 '기본 정보 > 글꼴 설정'에서 고른 글씨체를 반영합니다. (홈페이지와 같은 공용 모듈 사용)
  const { styleTag: fontStyleTag, extraLinks: extraFontLinks } = getFontStyleAndLinks(site.design || {});

  const navHtml = `
    <div class="qt-detail-nav">
      ${prev ? `<a href="/qt/${prev.id}">← ${escapeHtml(formatDateLabel(prev.date))} 큐티</a>` : '<span></span>'}
      ${next ? `<a href="/qt/${next.id}">${escapeHtml(formatDateLabel(next.date))} 큐티 →</a>` : '<span></span>'}
    </div>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<script>if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; }</script>
<!-- 글씨체 준비될 때까지 잠깐 화면 숨기기 (최대 0.5초) -->
<script>document.documentElement.classList.add('fonts-loading');</script>
<style>
  html.fonts-loading body { opacity: 0; }
  body { transition: opacity 0.25s ease; }
</style>
<script>
(function () {
  var done = false;
  function reveal() {
    if (done) return;
    done = true;
    document.documentElement.classList.remove('fonts-loading');
  }

  function waitForLinkLoad(link) {
    return new Promise(function (resolve) {
      if (link.sheet) { resolve(); return; }
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
    });
  }

  var fontLinks = Array.prototype.slice.call(document.querySelectorAll('link.gfont-link'));
  var linksReady = fontLinks.length ? Promise.all(fontLinks.map(waitForLinkLoad)) : Promise.resolve();
  var fontsApiReady = ('fonts' in document) ? document.fonts.ready : Promise.resolve();
  var ready = linksReady.then(function () { return fontsApiReady; });

  Promise.race([
    ready,
    new Promise(function (resolve) { setTimeout(resolve, 800); })
  ]).then(reveal);

  setTimeout(reveal, 1500);
})();
</script>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${pageUrl}" />
<meta property="og:title" content="${escapeHtml(item.title || '오늘의 큐티')}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(ogImage)}" />
<meta property="og:url" content="${pageUrl}" />
<meta property="og:type" content="article" />
<meta property="og:locale" content="ko_KR" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link class="gfont-link" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;700&family=Noto+Sans+KR:wght@400;500;600;700&display=block" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css">
${extraFontLinks}
<link rel="stylesheet" href="/css/style.css" />
${fontStyleTag}

<!-- PWA: 홈 화면에 추가했을 때 앱처럼 보이도록 하는 설정 -->
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0d1526" />
<link rel="icon" href="/icons/icon-192-v2.png" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-v2.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
</head>
<body>

<header class="site-header scrolled">
  <div class="container">
    <a href="/" class="brand">${escapeHtml(churchName)}</a>
  </div>
</header>

<main class="page-enter">
  <section class="section qt-detail-section">
    <div class="container qt-detail-container">

      <div class="qt-detail-head">
        <span class="qt-badge">오늘의 큐티</span>
        <p class="qt-detail-meta">${escapeHtml(formatDateLabel(item.date))}${pastor ? ` · ${escapeHtml(pastor)}` : ''}</p>
        <h1 class="qt-detail-title">${escapeHtml(item.title || '')}</h1>
      </div>

      ${
        item.verseText
          ? `<div class="qt-verse-card">
              <p class="qt-verse-text">${nl2br(item.verseText)}</p>
              ${item.verseRef ? `<p class="qt-verse-ref">${escapeHtml(item.verseRef)}</p>` : ''}
            </div>`
          : ''
      }

      ${item.body ? `<div class="qt-detail-body">${nl2br(item.body)}</div>` : ''}

      <div class="qt-reaction-bar">
        <button class="qt-listen-btn" id="qt-listen-btn">
          <span id="qt-listen-icon">🔊</span> <span id="qt-listen-label">듣기</span>
        </button>
        <button class="qt-amen-btn" id="qt-amen-btn" data-id="${escapeHtml(item.id)}">
          <span class="qt-heart" id="qt-heart">♡</span> '아멘' 누르기
        </button>
        ${renderQtAmenBadgeHtml(item.amen)}
        <button class="qt-share-btn" id="qt-share-btn"
          data-title="${escapeHtml(item.title || '오늘의 큐티')}"
          data-text="${escapeHtml((item.verseText || '').slice(0, 60))}"
          data-url="${pageUrl}"
          data-image="${escapeHtml(item.posterImage || item.bgImage || '')}">
          공유
        </button>
        <a href="/#qt" class="qt-home-btn">홈으로</a>
      </div>

      ${navHtml}

    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="container">
    <p>&copy; ${new Date().getFullYear()} ${escapeHtml(churchName)}. All rights reserved.</p>
  </div>
</footer>

<script src="/js/qt-detail.js"></script>
</body>
</html>`;
}

module.exports = { renderQtDetailPage };
