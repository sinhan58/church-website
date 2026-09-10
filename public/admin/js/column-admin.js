// ===================================================================
// 목회 칼럼 관리 — "오늘의 큐티" 옆 카드형 버튼으로 노출되는 목회 칼럼을 관리합니다.
// 제목·말씀 구절은 이번 주 최신 설교 영상 제목에서 자동으로 뽑아오고(자동 채우기
// 버튼), 칼럼 본문은 관리자가 직접 입력/붙여넣기합니다.
// (runAfterAdminLogin 함수는 service-background-admin.js에 이미 정의되어 있어
//  같은 페이지 안에서 그대로 가져다 씁니다.)
// ===================================================================
(function () {
  const $ = (sel) => document.querySelector(sel);

  const dateInput = $('#column-date');
  const pastorInput = $('#column-pastor');
  const titleInput = $('#column-title');
  const verseRefInput = $('#column-verseRef');
  const bodyInput = $('#column-body');
  const imageFileInput = $('#column-imageFile');
  const imagePreview = $('#column-imagePreview');
  const autofillBtn = $('#column-autofill-btn');
  const autofillStatus = $('#column-autofill-status');
  const saveBtn = $('#add-column-btn');
  const cancelBtn = $('#cancel-column-edit-btn');
  const saveStatus = $('#column-save-status');
  const formTitle = $('#column-form-title');
  const listEl = $('#column-list');

  if (!bodyInput || !saveBtn || !listEl) return; // 이 카드가 없는 페이지(다른 관리 화면)에서는 조용히 종료

  let editingId = null;

  function setSaveStatus(msg, isError) {
    saveStatus.textContent = msg;
    saveStatus.style.color = isError ? '#b3413a' : '#2f6d3a';
  }

  function setAutofillStatus(msg, isError) {
    if (!autofillStatus) return;
    autofillStatus.textContent = msg;
    autofillStatus.style.color = isError ? '#b3413a' : '#2f6d3a';
  }

  function escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // 사진을 고르면 바로 업로드해두고(/api/admin/upload), 저장 버튼을 누를 때는
  // 이미 끝난 업로드 결과(URL)만 붙여서 보냅니다. (다른 화면들의 이미지 필드와 같은 방식)
  if (imageFileInput) {
    imageFileInput.addEventListener('change', () => {
      const file = imageFileInput.files && imageFileInput.files[0];
      imageFileInput.dataset.uploadedUrl = '';
      if (!file) {
        if (imagePreview) imagePreview.src = '';
        return;
      }
      if (imagePreview) imagePreview.src = URL.createObjectURL(file);
      const form = new FormData();
      form.append('image', file);
      imageFileInput._uploadPromise = fetch('/api/admin/upload', { method: 'POST', body: form, credentials: 'include' })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || '이미지 업로드 실패');
          imageFileInput.dataset.uploadedUrl = data.url || '';
        })
        .catch((err) => {
          setSaveStatus('사진 업로드 실패: ' + err.message, true);
        });
    });
  }

  // 저장을 눌렀을 때 방금 고른 사진의 업로드가 아직 끝나지 않았다면 끝날 때까지 기다립니다.
  async function waitForPendingImageUpload() {
    if (imageFileInput && imageFileInput._uploadPromise) {
      await imageFileInput._uploadPromise;
    }
  }

  // main.js의 parseSermonTitleClient / 서버 sermonPoster.js의 parseSermonTitle과
  // 동일한 규칙 — "주일예배 20260830 사도행전 3장 1-10절 ..." 같은 제목에서
  // 날짜·머리말을 떼고 성경구절과 본 제목을 분리합니다.
  function parseSermonTitle(raw = '') {
    let t = raw.replace(/주일예배/g, '');
    t = t.replace(/\b\d{8}\b/g, '').trim().replace(/^[-_·\s]+|[-_·\s]+$/g, '');
    t = t.replace(/\s{2,}/g, ' ');
    const m = t.match(/^([가-힣]+\s?\d+장\s?\d+(?:[~\-]\d+)?절(?:,\s?\d+(?:[~\-]\d+)?절)*)\s*(.*)$/);
    if (m) return { verseRef: m[1].trim(), title: m[2].trim() || t };
    return { verseRef: '', title: t };
  }

  function resetForm() {
    editingId = null;
    dateInput.value = new Date().toISOString().slice(0, 10);
    pastorInput.value = '';
    titleInput.value = '';
    verseRefInput.value = '';
    bodyInput.value = '';
    if (imageFileInput) {
      imageFileInput.value = '';
      imageFileInput.dataset.uploadedUrl = '';
    }
    if (imagePreview) imagePreview.src = '';
    formTitle.textContent = '새 칼럼 작성';
    saveBtn.textContent = '칼럼 등록';
    if (cancelBtn) cancelBtn.hidden = true;
    setSaveStatus('', false);
    setAutofillStatus('', false);
  }

  async function autofillFromLatestSermon() {
    setAutofillStatus('불러오는 중...', false);
    try {
      const res = await fetch('/api/admin/sermons', { credentials: 'include' });
      if (!res.ok) throw new Error(`서버 응답 ${res.status}`);
      const data = await res.json();
      const latest = data && Array.isArray(data.videos) ? data.videos[0] : null;
      if (!latest) {
        setAutofillStatus('아직 등록된 설교 영상이 없습니다.', true);
        return;
      }
      const { verseRef, title } = parseSermonTitle(latest.title || '');
      titleInput.value = title || latest.title || '';
      verseRefInput.value = verseRef || '';
      setAutofillStatus('제목·말씀 구절을 채웠습니다. 본문은 직접 입력해주세요.', false);
    } catch (err) {
      setAutofillStatus('자동 채우기 실패: ' + err.message, true);
    }
  }

  async function loadList() {
    try {
      const res = await fetch('/api/admin/column', { credentials: 'include' });
      if (!res.ok) {
        listEl.innerHTML = `<p class="hint">불러오기 실패 (서버 응답 ${res.status})</p>`;
        return;
      }
      const columns = await res.json();
      if (!columns.length) {
        listEl.innerHTML = '<p class="hint" style="margin:0;">아직 등록된 칼럼이 없습니다.</p>';
        return;
      }
      listEl.innerHTML = columns
        .map(
          (c) => `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid var(--line); border-radius:8px; padding:12px 14px; margin-bottom:8px;" data-id="${c.id}">
            <div style="min-width:0;">
              <p style="margin:0; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(c.title || '(제목 없음)')}</p>
              <p class="hint" style="margin:4px 0 0;">${escapeHtml(c.date || '')}${c.verseRef ? ' · ' + escapeHtml(c.verseRef) : ''}${c.pastor ? ' · ' + escapeHtml(c.pastor) : ''}</p>
            </div>
            <div style="display:flex; gap:6px; flex-shrink:0;">
              <button type="button" class="btn-secondary column-edit-btn">수정</button>
              <button type="button" class="btn-secondary column-delete-btn">삭제</button>
            </div>
          </div>`
        )
        .join('');

      listEl.querySelectorAll('.column-edit-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.closest('[data-id]').dataset.id;
          const item = columns.find((c) => c.id === id);
          if (!item) return;
          editingId = id;
          dateInput.value = item.date || '';
          pastorInput.value = item.pastor || '';
          titleInput.value = item.title || '';
          verseRefInput.value = item.verseRef || '';
          bodyInput.value = item.body || '';
          if (imageFileInput) {
            imageFileInput.value = '';
            imageFileInput.dataset.uploadedUrl = item.bgImage || '';
          }
          if (imagePreview) imagePreview.src = item.bgImage || '';
          formTitle.textContent = '칼럼 수정';
          saveBtn.textContent = '수정 완료';
          if (cancelBtn) cancelBtn.hidden = false;
          setSaveStatus('', false);
          const card = bodyInput.closest('.card');
          if (card) window.scrollTo({ top: card.offsetTop - 20, behavior: 'smooth' });
        });
      });

      listEl.querySelectorAll('.column-delete-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('[data-id]').dataset.id;
          if (!confirm('이 칼럼을 삭제하시겠습니까?')) return;
          try {
            const delRes = await fetch(`/api/admin/column/${id}`, { method: 'DELETE', credentials: 'include' });
            if (!delRes.ok) throw new Error(`서버 응답 ${delRes.status}`);
            if (editingId === id) resetForm();
            loadList();
          } catch (err) {
            alert('삭제 실패: ' + err.message);
          }
        });
      });
    } catch (err) {
      listEl.innerHTML = `<p class="hint">불러오기 중 오류가 발생했습니다: ${escapeHtml(err.message)}</p>`;
    }
  }

  if (autofillBtn) autofillBtn.addEventListener('click', autofillFromLatestSermon);
  if (cancelBtn) cancelBtn.addEventListener('click', resetForm);

  saveBtn.addEventListener('click', async () => {
    if (!bodyInput.value.trim()) {
      setSaveStatus('칼럼 본문을 입력해주세요.', true);
      return;
    }
    setSaveStatus('저장 중...', false);
    await waitForPendingImageUpload();
    const payload = {
      date: dateInput.value || new Date().toISOString().slice(0, 10),
      pastor: pastorInput.value.trim(),
      title: titleInput.value.trim(),
      verseRef: verseRefInput.value.trim(),
      body: bodyInput.value.trim(),
      bgImage: (imageFileInput && imageFileInput.dataset.uploadedUrl) || ''
    };
    try {
      const url = editingId ? `/api/admin/column/${editingId}` : '/api/admin/column';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        let detail = `서버 응답 ${res.status}`;
        try {
          const errBody = await res.json();
          if (errBody && errBody.error) detail += `: ${errBody.error}`;
        } catch (parseErr) {
          // 응답이 JSON이 아니면 상태 코드만 표시
        }
        throw new Error(detail);
      }
      setSaveStatus('저장되었습니다. 홈페이지에서 확인해보세요.', false);
      resetForm();
      loadList();
    } catch (err) {
      setSaveStatus('저장 실패: ' + err.message, true);
    }
  });

  runAfterAdminLogin(() => {
    resetForm();
    loadList();
  });
})();
