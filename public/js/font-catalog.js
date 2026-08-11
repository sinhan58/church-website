// 사이트에서 선택할 수 있는 글씨체(폰트) 목록입니다.
// 새 폰트를 추가하려면: 1) 아래 배열에 항목 추가  2) index.html / admin/index.html의
// Google Fonts <link> 주소에 &family=폰트이름 을 추가하면 됩니다.
// 사이트에서 선택할 수 있는 글씨체(폰트) 목록입니다.
// 새 폰트를 추가하려면: 1) 아래 배열에 항목 추가  2) GOOGLE_FONT_SPECS에도 구글 폰트 주소용
// family 스펙을 추가하면 됩니다. (index.html 등에는 더 이상 폰트를 직접 추가하지 않아도 됩니다)
window.FONT_CATALOG = [
  { id: 'pretendard', label: '프리텐다드 (기본 · 깔끔한 고딕)', family: "'Pretendard', 'Noto Sans KR', sans-serif" },
  { id: 'noto-sans-kr', label: '노토 산스 (표준 고딕)', family: "'Noto Sans KR', sans-serif" },
  { id: 'noto-serif-kr', label: '노토 세리프 (기본 명조)', family: "'Noto Serif KR', serif" },
  { id: 'gowun-dodum', label: '고운돋움 (부드러운 고딕)', family: "'Gowun Dodum', sans-serif" },
  { id: 'gowun-batang', label: '고운바탕 (부드러운 명조)', family: "'Gowun Batang', serif" },
  { id: 'nanum-gothic', label: '나눔고딕', family: "'Nanum Gothic', sans-serif" },
  { id: 'nanum-myeongjo', label: '나눔명조', family: "'Nanum Myeongjo', serif" },
  { id: 'black-han-sans', label: '검은고딕 (굵고 강한 느낌)', family: "'Black Han Sans', sans-serif" },
  { id: 'do-hyeon', label: '도현 (캐주얼한 고딕)', family: "'Do Hyeon', sans-serif" },
  { id: 'song-myung', label: '송명 (붓글씨 느낌 명조)', family: "'Song Myung', serif" },
  { id: 'poor-story', label: '푸어스토리 (손글씨 느낌)', family: "'Poor Story', cursive" },
  { id: 'gothic-a1', label: '고딕 A1 (다양한 굵기의 모던 고딕)', family: "'Gothic A1', sans-serif" },
  { id: 'ibm-plex-sans-kr', label: 'IBM 플렉스 산스 (깔끔한 모던 고딕)', family: "'IBM Plex Sans KR', sans-serif" },
  { id: 'hahmlet', label: '함렛 (세련된 명조)', family: "'Hahmlet', serif" },
  { id: 'jua', label: '주아 (통통하고 친근한 고딕)', family: "'Jua', sans-serif" },
  { id: 'sunflower', label: '해바라기 (둥글둥글한 고딕)', family: "'Sunflower', sans-serif" }
];

window.getFontFamily = function (id, fallback) {
  const found = window.FONT_CATALOG.find((f) => f.id === id);
  return found ? found.family : fallback;
};

// ---------------------------------------------------------------------------
// 구글 폰트 최적화: 홈페이지에는 기본으로 Noto Serif KR / Noto Sans KR 두 개만
// 미리 불러와두고(<head>의 <link> 참고), 관리자가 그 외 폰트(고운돋움, 나눔고딕,
// 검은고딕 등)를 실제로 선택했을 때만 그 폰트 하나만 동적으로 추가 로딩합니다.
// 방문자 대부분은 기본 폰트를 그대로 쓰기 때문에, 안 쓰는 폰트 8종을 매번 다 받을
// 필요가 없어서 초기 로딩이 가벼워집니다.
// ---------------------------------------------------------------------------
const GOOGLE_FONT_SPECS = {
  'noto-sans-kr': 'Noto+Sans+KR:wght@400;500;600',
  'noto-serif-kr': 'Noto+Serif+KR:wght@500;700',
  'gowun-dodum': 'Gowun+Dodum',
  'gowun-batang': 'Gowun+Batang',
  'nanum-gothic': 'Nanum+Gothic:wght@400;700;800',
  'nanum-myeongjo': 'Nanum+Myeongjo:wght@400;700;800',
  'black-han-sans': 'Black+Han+Sans',
  'do-hyeon': 'Do+Hyeon',
  'song-myung': 'Song+Myung',
  'poor-story': 'Poor+Story',
  'gothic-a1': 'Gothic+A1:wght@400;700;900',
  'ibm-plex-sans-kr': 'IBM+Plex+Sans+KR:wght@400;500;700',
  'hahmlet': 'Hahmlet:wght@400;600;700',
  'jua': 'Jua',
  'sunflower': 'Sunflower:wght@300;500;700'
  // 'pretendard'는 별도 CDN(jsdelivr)에서 이미 항상 불러오고 있어서 여기 포함하지 않습니다.
};

// 이미 <head>에 기본으로 박아둔 폰트라 다시 안 불러와도 되는 것들
const PRELOADED_FONT_IDS = ['noto-serif-kr', 'noto-sans-kr', 'pretendard'];

const loadedFontIds = new Set(PRELOADED_FONT_IDS);

window.ensureGoogleFont = function (id) {
  if (!id || loadedFontIds.has(id)) return;
  const spec = GOOGLE_FONT_SPECS[id];
  if (!spec) return; // pretendard 등 별도 처리되는 폰트이거나 알 수 없는 id

  loadedFontIds.add(id);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=optional`;
  document.head.appendChild(link);
};
