// ===================================================================
// 목회 칼럼 상세 페이지 전용 스크립트 — 공유 버튼만 담당합니다.
// (큐티 상세 페이지의 '아멘'·'듣기' 같은 기능은 칼럼에는 없어서, qt-detail.js를
//  그대로 쓰지 않고 이렇게 작고 독립된 파일로 따로 둡니다.)
// ===================================================================
(function () {
  const shareBtn = document.getElementById('column-share-btn');
  if (!shareBtn) return;

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
})();
