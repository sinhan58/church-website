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

// 목회 칼럼 상세 페이지 전체 HTML을 문자열로 만들어 돌려줍니다. 큐티 상세 페이지와
// 똑같이, 검색엔진이 자바스크립트 실행 없이도 칼럼 내용을 그대로 읽을 수 있도록
// 서버에서 직접 렌더링합니다(고유 URL + OG태그 + canonical → 포털 노출·링크 공유 가능).
function renderColumnDetailPage({ site, item, prev, next, siteUrl, cameFromHome }) {
  const churchName = site.churchName || '교회';
  const pastor = item.pastor || site.about?.pastorName || '';
  const pageTitle = `${item.title || '목회 칼럼'} | ${churchName} 목회 칼럼`;
  const description = (item.body || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const pageUrl = `${siteUrl}/column/${item.id}`;
  const ogImage = item.bgImage || site.about?.image || `${siteUrl}/uploads/0001.png`;

  // 관리자가 '기본 정보 > 글꼴 설정'에서 고른 글씨체를 반영합니다. (홈페이지와 같은 공용 모듈 사용)
  const { styleTag: fontStyleTag, extraLinks: extraFontLinks } = getFontStyleAndLinks(site.design || {});

  // 홈페이지가 컨셉B로 설정되어 있으면, 이 페이지도 처음 그려질 때부터 같은 미스트
  // 헤더로 뜨도록 <html>에 class="theme-b"를 서버에서 미리 심어 보냅니다.
  const htmlClassAttr = site.theme === 'b' ? ' class="theme-b"' : '';

  const navHtml = `
    <div class="qt-detail-nav">
      ${prev ? `<a href="/column/${prev.id}">← ${escapeHtml(formatDateLabel(prev.date))} 칼럼</a>` : '<span></span>'}
      ${next ? `<a href="/column/${next.id}">${escapeHtml(formatDateLabel(next.date))} 칼럼 →</a>` : '<span></span>'}
    </div>`;

  // 큐티 상세 페이지와 같은 방식: 사진이 있으면 제목 구간을 그 사진을 배경으로 크게
  // 보여주고(카드 목록과 같은 느낌), 본문 이하는 흰 바탕 그대로 둡니다.
  const heroClass = item.bgImage ? 'qt-detail-hero qt-detail-hero--photo' : 'qt-detail-hero';
  const heroStyle = item.bgImage ? ` style="--qt-hero-bg: url('${escapeHtml(item.bgImage)}')"` : '';

  return `<!DOCTYPE html>
<html lang="ko"${htmlClassAttr}>
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
    new Promise(function (resolve) { setTimeout(resolve, 1200); })
  ]).then(reveal);

  setTimeout(reveal, 1500);
})();
</script>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${pageUrl}" />
<meta property="og:title" content="${escapeHtml(item.title || '목회 칼럼')}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(ogImage)}" />
<meta property="og:url" content="${pageUrl}" />
<meta property="og:type" content="article" />
<meta property="og:locale" content="ko_KR" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link class="gfont-link" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;700&family=Noto+Sans+KR:wght@400;500;600;700&display=block" rel="stylesheet">
<link class="gfont-link" rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css">
${extraFontLinks}
<link rel="stylesheet" href="/css/style.css?v=188" />
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

      <div class="${heroClass}"${heroStyle}>
        <div class="qt-detail-head">
          <span class="qt-badge">목회 칼럼</span>
          <p class="qt-detail-meta">${escapeHtml(formatDateLabel(item.date))}${pastor ? ` · ${escapeHtml(pastor)}` : ''}</p>
          <h1 class="qt-detail-title">${escapeHtml(item.title || '')}</h1>
          ${item.verseRef ? `<p class="column-detail-verseref">${escapeHtml(item.verseRef)}</p>` : ''}
        </div>
      </div>

      ${item.body ? `<div class="qt-detail-body">${nl2br(item.body)}</div>` : ''}

      <div class="qt-reaction-bar">
        <button class="qt-share-btn" id="column-share-btn"
          data-title="${escapeHtml(item.title || '목회 칼럼')}"
          data-url="${pageUrl}">
          공유
        </button>
        <a href="/" class="qt-home-btn" id="column-home-btn"${cameFromHome ? ' data-back="1"' : ''}>홈으로</a>
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

<script src="/js/column-detail.js?v=2"></script>
</body>
</html>`;
}

module.exports = { renderColumnDetailPage };
