// 사이트에서 선택할 수 있는 글씨체(폰트) 목록입니다.
// 새 폰트를 추가하려면: 1) 아래 배열에 항목 추가  2) index.html / admin/index.html의
// Google Fonts <link> 주소에 &family=폰트이름 을 추가하면 됩니다.
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
  { id: 'poor-story', label: '푸어스토리 (손글씨 느낌)', family: "'Poor Story', cursive" }
];

window.getFontFamily = function (id, fallback) {
  const found = window.FONT_CATALOG.find((f) => f.id === id);
  return found ? found.family : fallback;
};
