// ===================================================================
// 새가족 안내 페이지 → '교회가 되십시오' 버튼으로 열리는 별도 페이지(gospel.html)의
// 본문(복음 메시지)을 관리합니다. 아직 믿지 않는 분들께 전할 메시지를 자유롭게
// 글 + 이미지로 구성할 수 있도록 Quill 리치 텍스트 에디터를 사용합니다.
//
// 저장 방식: 기존 "기본 정보 저장"(admin.js, #save-site-btn) 로직을 건드리지 않고,
// 이 카드만의 독립된 저장 버튼으로 site.newFamily.gospelHtml 값을 저장합니다.
// (admin.js는 파일이 크고 예민해서, 새 기능은 항상 이렇게 따로 분리해 추가합니다.
//  column-admin.js와 같은 방식입니다.)
//
// runAfterAdminLogin 함수는 service-background-admin.js에 이미 정의되어 있어
// 같은 페이지 안에서 그대로 가져다 씁니다.
// ===================================================================
(function () {
  const $ = (sel) => document.querySelector(sel);

  const mount = $('#gospel-content-quill');
  const saveBtn = $('#gospel-content-save-btn');
  const statusEl = $('#gospel-content-save-status');

  if (!mount || !saveBtn) return; // 이 카드가 없는 페이지에서는 조용히 종료

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#b3413a' : '#2f6d3a';
  }

  if (typeof Quill === 'undefined') {
    setStatus('리치 에디터(Quill)를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.', true);
    return;
  }

  let quill;
  try {
    quill = new Quill(mount, {
      theme: 'snow',
      placeholder: '복음 메시지를 자유롭게 작성해주세요. 여러 문단, 이미지, 목록, 인용구 등을 넣을 수 있습니다.',
      modules: {
        toolbar: [
          [{ size: ['14px', false, '20px', '26px'] }],
          ['bold', 'italic', 'underline'],
          [{ align: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['blockquote'],
          ['image'],
          ['clean']
        ]
      }
    });
  } catch (err) {
    setStatus('에디터 초기화 실패: ' + err.message, true);
    return;
  }

  // 이미지 업로드 — 기존 관리자 이미지 업로드 API(/api/admin/upload)를 그대로 재사용합니다.
  // (base64로 본문에 직접 박아넣으면 site.json이 급격히 커져서, 서버에 올리고 URL만 넣습니다.)
  const toolbar = quill.getModule('toolbar');
  toolbar.addHandler('image', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const range = quill.getSelection(true) || { index: quill.getLength() };
      setStatus('이미지 업로드 중...', false);
      try {
        const form = new FormData();
        form.append('image', file);
        const res = await fetch('/api/admin/upload', { method: 'POST', body: form });
        let data;
        try {
          data = await res.json();
        } catch (parseErr) {
          if (res.status === 401 || res.status === 403) {
            throw new Error('로그인이 만료되었습니다. 새로고침 후 다시 로그인해주세요.');
          }
          if (res.status === 413) {
            throw new Error('사진 파일이 너무 큽니다. 더 작은 용량의 사진으로 다시 시도해주세요.');
          }
          throw new Error(`이미지 업로드 실패 (서버 응답 ${res.status})`);
        }
        if (!res.ok) throw new Error(data.error || '이미지 업로드 실패');
        quill.insertEmbed(range.index, 'image', data.url);
        quill.setSelection(range.index + 1);
        setStatus('', false);
      } catch (err) {
        setStatus(err.message || '이미지 업로드 중 오류가 발생했습니다.', true);
      }
    };
    input.click();
  });

  async function loadContent() {
    try {
      const res = await fetch('/api/admin/site');
      if (!res.ok) return;
      const site = await res.json();
      const html = site && site.newFamily && site.newFamily.gospelHtml;
      if (html && html.trim()) {
        quill.clipboard.dangerouslyPasteHTML(0, html);
      }
    } catch (err) {
      setStatus('기존 내용을 불러오지 못했습니다. (' + err.message + ')', true);
    }
  }

  async function save() {
    saveBtn.disabled = true;
    setStatus('저장 중...', false);
    try {
      const html = quill.getText().trim() === '' ? '' : quill.root.innerHTML;
      const res = await fetch('/api/admin/site', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newFamily: { gospelHtml: html } })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setStatus('저장되었습니다.', false);
    } catch (err) {
      setStatus(err.message || '저장 중 오류가 발생했습니다.', true);
    } finally {
      saveBtn.disabled = false;
    }
  }

  saveBtn.addEventListener('click', save);

  if (typeof runAfterAdminLogin === 'function') {
    runAfterAdminLogin(() => {
      loadContent();
    });
  } else {
    loadContent();
  }
})();
