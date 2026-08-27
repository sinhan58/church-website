// ===================================================================
// 예배 안내 배경 사진 (초점 위치 + 확대) — 관리자 화면 연동 스크립트
// 기존 /admin/js/admin.js 파일 맨 아래에 이어 붙이거나,
// index_thml_admin_.html 에 <script> 태그로 이 파일을 따로 불러오면 됩니다.
// (같은 페이지에 $ 헬퍼와 로그인 세션 쿠키가 이미 있다는 전제로 작성했습니다.
//  $가 없다면 document.getElementById로 바꿔서 쓰시면 됩니다.)
// ===================================================================
(function () {
  const $ = (sel) => document.querySelector(sel);

  const fileInput = $('#s-serviceImageFile');
  const previewWrap = $('#s-serviceBgPreviewWrap');
  const previewImg = $('#s-serviceBgPreviewImg');
  const marker = $('#s-serviceBgFocalMarker');
  const emptyHint = $('#s-serviceBgEmptyHint');
  const zoomInput = $('#s-serviceZoom');
  const zoomValueLabel = $('#s-serviceZoomValue');
  const saveBtn = $('#s-serviceBgSaveBtn');
  const statusEl = $('#s-serviceBgStatus');

  if (!fileInput || !saveBtn) return; // 이 카드가 없는 페이지에서는 조용히 종료

  // 현재 상태 (서버에 보낼 값)
  let state = {
    backgroundImage: '',
    focalX: 50,
    focalY: 50,
    zoom: 100
  };

  function showPreview(url) {
    previewImg.src = url;
    previewWrap.style.display = 'block';
    emptyHint.style.display = 'none';
    updateMarkerPosition();
  }

  function updateMarkerPosition() {
    marker.style.left = state.focalX + '%';
    marker.style.top = state.focalY + '%';
  }

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#b3413a' : '#2f6d3a';
  }

  // 기존 저장된 값 불러오기
  async function loadCurrent() {
    try {
      const res = await fetch('/api/admin/site', { credentials: 'include' });
      const site = await res.json();
      if (site && site.service && site.service.backgroundImage) {
        state = {
          backgroundImage: site.service.backgroundImage,
          focalX: site.service.focalX != null ? site.service.focalX : 50,
          focalY: site.service.focalY != null ? site.service.focalY : 50,
          zoom: site.service.zoom || 100
        };
        zoomInput.value = state.zoom;
        zoomValueLabel.textContent = state.zoom;
        showPreview(state.backgroundImage);
      }
    } catch (err) {
      console.error('예배 안내 배경 불러오기 실패:', err);
    }
  }

  // 사진 업로드
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    setStatus('업로드 중...', false);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || '업로드 실패');
      state.backgroundImage = data.url;
      state.focalX = 50;
      state.focalY = 50;
      state.zoom = 100;
      zoomInput.value = 100;
      zoomValueLabel.textContent = '100';
      showPreview(data.url);
      setStatus('업로드 완료. 원하는 지점을 클릭하고 저장을 눌러주세요.', false);
    } catch (err) {
      setStatus('업로드 실패: ' + err.message, true);
    }
  });

  // 미리보기 클릭 → 초점 좌표 지정
  previewWrap.addEventListener('click', (e) => {
    if (!state.backgroundImage) return;
    const rect = previewWrap.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    state.focalX = Math.round(Math.min(100, Math.max(0, x)));
    state.focalY = Math.round(Math.min(100, Math.max(0, y)));
    updateMarkerPosition();
  });

  // 확대 슬라이더
  zoomInput.addEventListener('input', () => {
    state.zoom = Number(zoomInput.value);
    zoomValueLabel.textContent = state.zoom;
    // 확대 배율에 따라 미리보기에서도 초점을 기준으로 확대되는 걸 보여줍니다
    previewImg.style.transformOrigin = state.focalX + '% ' + state.focalY + '%';
    previewImg.style.transform = 'scale(' + state.zoom / 100 + ')';
  });

  // 저장
  saveBtn.addEventListener('click', async () => {
    if (!state.backgroundImage) {
      setStatus('먼저 사진을 업로드해주세요.', true);
      return;
    }
    setStatus('저장 중...', false);
    try {
      const res = await fetch('/api/admin/site', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: state })
      });
      if (!res.ok) throw new Error('저장 실패');
      setStatus('저장되었습니다. 홈페이지에서 확인해보세요.', false);
    } catch (err) {
      setStatus('저장 실패: ' + err.message, true);
    }
  });

  loadCurrent();
})();
