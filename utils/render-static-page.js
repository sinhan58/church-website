const fs = require('fs');
const path = require('path');
const { getFontStyleAndLinks } = require('./font-catalog');

// 기도 요청 / 온라인 문의 / 영수증 신청 페이지처럼, 내용 자체는 그대로(정적)이지만
// <head>에 관리자가 고른 글씨체만 요청마다 새로 심어서 보내야 하는 페이지들을 위한
// 공용 렌더러입니다. 홈페이지·큐티 상세 페이지에 이미 쓰고 있는 것과 같은 방식입니다.
//
// 사용법: 한 번만 만들어두고(모듈 로드 시 파일을 메모리에 읽어둠), 요청이 올 때마다
// render({ site })를 호출해서 완성된 HTML을 받습니다.
function createStaticPageRenderer(relativePublicPath) {
  const templatePath = path.join(__dirname, '..', 'public', relativePublicPath);
  const template = fs.readFileSync(templatePath, 'utf-8');

  return function render({ site } = {}) {
    const { styleTag, extraLinks } = getFontStyleAndLinks(site?.design || {});
    // 본문 <link class="gfont-link" ...> 바로 다음 자리에 표시해둔 위치에 스타일 태그를 심고,
    // 추가로 필요한 구글 폰트가 있으면 그 앞에 <link>도 같이 끼워 넣습니다.
    return template.replace('<!--FONT_STYLE_TAG-->', `${extraLinks}\n${styleTag}`);
  };
}

module.exports = { createStaticPageRenderer };
