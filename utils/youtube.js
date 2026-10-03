const fetch = require('node-fetch');
const { XMLParser } = require('fast-xml-parser');
const { readData, writeData } = require('./db');

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

/**
 * 유튜브는 별도 API 키 없이도 채널의 업로드 RSS 피드를 제공합니다.
 * 채널ID(UC로 시작)만 있으면 최신 영상 목록(최대 15개)을 가져올 수 있습니다.
 */
async function fetchLatestVideos(channelId) {
  if (!channelId) throw new Error('YOUTUBE_CHANNEL_ID가 설정되지 않았습니다.');

  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (church-website-bot)' } });

  if (!res.ok) {
    throw new Error(`유튜브 피드를 가져오지 못했습니다 (status: ${res.status})`);
  }

  const xml = await res.text();
  const parsed = parser.parse(xml);

  const feed = parsed.feed;
  if (!feed || !feed.entry) return [];

  const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];

  return entries.map((entry) => {
    const videoId = entry['yt:videoId'];
    const mediaGroup = entry['media:group'] || {};
    const thumbnail = mediaGroup['media:thumbnail']
      ? mediaGroup['media:thumbnail']['@_url']
      : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    return {
      videoId,
      title: entry.title,
      publishedAt: entry.published,
      thumbnail,
      url: `https://www.youtube.com/watch?v=${videoId}`
    };
  });
}

// 보관함에도 없는(예전에 이미 목록에서 밀려나 정보가 사라진) 테마 영상을 되살리기 위해,
// 유튜브 공개 oEmbed로 제목을 다시 받아옵니다. (API 키 불필요, 실패하면 조용히 건너뜀)
async function fetchVideoInfo(videoId) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (church-website-bot)' } });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      videoId,
      title: d.title || '',
      publishedAt: null, // oEmbed는 게시일을 주지 않음 → 보관함 목록 맨 뒤에 놓임
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      recovered: true
    };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 최신 영상을 가져와 data/sermons.json 에 캐시로 저장합니다.
 * (관리자 수동 새로고침 및 스케줄러가 공통으로 사용)
 */
async function updateSermonsCache(channelId, limit = 12) {
  const videos = await fetchLatestVideos(channelId);
  const trimmed = videos.slice(0, limit);

  // 테마가 붙어있는 영상은 "최신 N개" 캐시에서 밀려나 사라지기 전에 별도 보관함
  // (sermonsArchive)에 챙겨둡니다. 이렇게 해야 테마별 필터가 계속 정상 작동합니다.
  // 이 처리가 실패하더라도 최신 목록 캐싱 자체(핵심 기능)는 계속 진행되어야 하므로
  // try/catch로 감싸서 조용히 로그만 남기고 넘어갑니다.
  try {
    const [prevCache, tags, existingArchive] = await Promise.all([
      readData('sermons'),
      readData('sermonCategoryTags'),
      readData('sermonsArchive')
    ]);
    const prevVideos = prevCache && Array.isArray(prevCache.videos) ? prevCache.videos : [];
    const tagMap = tags || {};
    const archive = Array.isArray(existingArchive) ? existingArchive.slice() : [];
    const archiveIds = new Set(archive.map((v) => v.videoId));
    const newIds = new Set(trimmed.map((v) => v.videoId));
    let archiveChanged = false;

    // 1) 태그가 있는데 이번 최신 목록에는 없고, 아직 보관함에도 없는 영상 → 보관함에 추가
    prevVideos.forEach((v) => {
      const hasTag = (tagMap[v.videoId] || []).length > 0;
      if (hasTag && !newIds.has(v.videoId) && !archiveIds.has(v.videoId)) {
        archive.push(v);
        archiveIds.add(v.videoId);
        archiveChanged = true;
      }
    });

    // 1-2) 테마는 붙어 있는데 최신 목록에도, 보관함에도 없는 영상(이 기능이 생기기 전에 이미
    //      밀려나 정보가 사라진 경우 등) → 유튜브에서 제목을 다시 받아와 보관함에 되살림
    const missing = Object.keys(tagMap).filter(
      (id) => (tagMap[id] || []).length > 0 && !newIds.has(id) && !archiveIds.has(id)
    ).slice(0, 30);
    for (const id of missing) {
      const info = await fetchVideoInfo(id);
      if (info) {
        archive.push(info);
        archiveIds.add(id);
        archiveChanged = true;
      }
    }

    // 2) 보관함에 있던 영상의 테마 태그가 전부 없어졌으면(관리자가 테마 해제) 보관함에서도 정리
    for (let i = archive.length - 1; i >= 0; i -= 1) {
      const hasTag = (tagMap[archive[i].videoId] || []).length > 0;
      if (!hasTag) {
        archive.splice(i, 1);
        archiveChanged = true;
      }
    }

    if (archiveChanged) {
      await writeData('sermonsArchive', archive);
    }
  } catch (err) {
    console.error('설교 보관함(sermonsArchive) 갱신 실패 (최신 목록 캐싱은 계속 진행됩니다):', err.message);
  }

  const data = {
    lastUpdated: new Date().toISOString(),
    videos: trimmed,
    channelId
  };
  writeData('sermons', data);
  return data;
}

// 홈페이지·관리자 페이지에 보여줄 설교 목록 = 최신 영상 + 테마가 지정된 지난 영상(보관함).
// 예전에는 보관함에 챙겨두기만 하고 실제로 목록에 합쳐 보내지 않아서, 테마를 지정한
// 영상도 최신 목록에서 밀려나면 홈페이지 설교 섹션에서 사라졌습니다.
// 최신 영상이 앞(맨 앞 영상 = 대표 설교)이고, 보관함 영상은 그 뒤에 게시일 최신순으로 붙습니다.
async function getCachedSermons() {
  const [cached, archive, tags] = await Promise.all([
    readData('sermons'),
    readData('sermonsArchive'),
    readData('sermonCategoryTags')
  ]);
  const base = cached || { lastUpdated: null, videos: [] };
  const latest = Array.isArray(base.videos) ? base.videos : [];
  const latestIds = new Set(latest.map((v) => v.videoId));
  const tagMap = tags || {};
  const kept = (Array.isArray(archive) ? archive : [])
    .filter((v) => v && v.videoId && !latestIds.has(v.videoId) && (tagMap[v.videoId] || []).length > 0)
    .sort((a, b) => {
      if (!a.publishedAt) return 1;
      if (!b.publishedAt) return -1;
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    })
    .map((v) => ({ ...v, archived: true }));
  return { ...base, videos: latest.concat(kept) };
}

module.exports = { fetchLatestVideos, updateSermonsCache, getCachedSermons };
