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
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;700&family=Noto+Sans+KR:wght@400;500;600;700&display=optional" rel="stylesheet">
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
        <button class="qt-amen-btn" id="qt-amen-btn" data-id="${escapeHtml(item.id)}">
          <span class="qt-heart" id="qt-heart">♡</span> '아멘' 누르기
        </button>
        <button class="qt-share-btn" id="qt-share-btn"
          data-title="${escapeHtml(item.title || '오늘의 큐티')}"
          data-text="${escapeHtml((item.verseText || '').slice(0, 60))}"
          data-url="${pageUrl}">
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
    <p>&copy; ${new Date().getFullYear()} ${escapeHtml(churchName)}. All rights reserved. &nbsp;·&nbsp; <a class="admin-link" href="/admin">관리자</a></p>
  </div>
</footer>

<script src="/js/qt-detail.js"></script>
</body>
</html>`;
}

module.exports = { renderQtDetailPage };
