// ===================================================================
// 목회 칼럼 상세 페이지 전용 스크립트 — 공유 버튼과 '홈으로' 버튼(뒤로 가기)을 담당합니다.
// (큐티 상세 페이지의 '아멘'·'듣기' 같은 기능은 칼럼에는 없어서, qt-detail.js를
//  그대로 쓰지 않고 이렇게 작고 독립된 파일로 따로 둡니다.)
// ===================================================================
(function () {
  const shareBtn = document.getElementById('column-share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const url = shareBtn.dataset.url || window.location.href;
      try {
        if (navigator.share) {
          // 카카오톡 등에서 링크만 보내면 자동으로 카드 미리보기가 하나만 깔끔하게 뜨므로,
          // title/text 없이 url만 전달합니다. (큐티 공유 기능과 같은 방식)
          await navigator.share({ url });
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
          alert('링크가 복사되었습니다.');
        } else {
          window.prompt('아래 링크를 복사해주세요.', url);
        }
      } catch (err) {
        // 공유 취소 등은 조용히 무시합니다.
      }
    });
  }

  // '홈으로' 버튼 — 홈페이지 칼럼 카드를 눌러서 들어온 경우라면, 페이지를 다시
  // 불러올 필요 없이 뒤로 가기만 하면 원래 보던 화면(스크롤 위치까지) 그대로
  // 순간 이동합니다. 큐티 상세 페이지(qt-detail.js)와 완전히 같은 방식입니다.
  const homeBtn = document.getElementById('column-home-btn');
  if (homeBtn && homeBtn.dataset.back === '1') {
    homeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const startPath = location.pathname;
      history.back();
      // 일부 브라우저 확장 프로그램(광고 차단기 등)이 history.back()을 막거나
      // 무시하는 경우가 있어서, 짧은 시간 안에 실제로 페이지를 벗어났는지 확인하고
      // 안 벗어났으면 안전하게 홈페이지로 직접 이동시킵니다.
      setTimeout(() => {
        if (location.pathname === startPath) {
          location.href = '/';
        }
      }, 300);
    });
  }
})();
