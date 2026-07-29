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

/**
 * 최신 영상을 가져와 data/sermons.json 에 캐시로 저장합니다.
 * (관리자 수동 새로고침 및 스케줄러가 공통으로 사용)
 */
async function updateSermonsCache(channelId, limit = 12) {
  const videos = await fetchLatestVideos(channelId);
  const trimmed = videos.slice(0, limit);
  const data = {
    lastUpdated: new Date().toISOString(),
    videos: trimmed
  };
  writeData('sermons', data);
  return data;
}

function getCachedSermons() {
  return readData('sermons') || { lastUpdated: null, videos: [] };
}

module.exports = { fetchLatestVideos, updateSermonsCache, getCachedSermons };
