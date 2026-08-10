// 물댄동산교회 홈페이지 서비스워커
// - 목적: PWA "설치 가능" 조건 충족 + 정적 파일(디자인·스크립트) 캐싱으로 재방문 시 조금 더 빠르게 뜨도록
// - 설교 영상/게시글/큐티 등 실제 데이터(API 응답)는 캐싱하지 않습니다 (항상 최신 정보를 보여주기 위함)

const CACHE_VERSION = 'v1';
const CACHE_NAME = `mdds-church-${CACHE_VERSION}`;

// 앱의 "뼈대"에 해당하는, 자주 안 바뀌는 정적 파일만 캐싱합니다.
const APP_SHELL = [
  '/',
  '/css/style.css',
  '/js/main.js',
  '/js/font-catalog.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 우리 서버가 아닌 요청(구글폰트, CDN 등)은 그대로 통과시킴
  if (url.origin !== self.location.origin) return;

  // API 요청(/api/...)은 항상 최신 데이터를 받아야 하므로 캐싱하지 않고 네트워크로만 처리
  if (url.pathname.startsWith('/api/')) return;

  // 관리자 페이지는 캐싱하지 않음(항상 최신 상태로)
  if (url.pathname.startsWith('/admin')) return;

  // 그 외 정적 파일: 네트워크를 우선 시도하고, 실패(오프라인 등)하면 캐시에서 꺼내옵니다.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
  );
});
