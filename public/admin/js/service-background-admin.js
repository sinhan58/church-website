// ===================================================================
// 배경 사진 (초점 위치 + 확대) 편집기 — 예배 안내 / 찬양 공용
// 기존 /admin/js/admin.js 파일 맨 아래에 이어 붙이거나,
// index_thml_admin_.html 에 <script> 태그로 이 파일을 따로 불러오면 됩니다.
// (같은 페이지에 $ 헬퍼와 로그인 세션 쿠키가 이미 있다는 전제로 작성했습니다.
//  $가 없다면 document.getElementById로 바꿔서 쓰시면 됩니다.)
// ===================================================================

// 로그인 화면(#dashboard가 hidden 상태)에서 페이지가 열리면, 바로 데이터를 불러오려다
// 401(로그인 필요) 에러만 받고 끝나버립니다. #dashboard의 hidden 속성이 없어지는
// 순간(=로그인 완료)을 감지해서 그때 콜백을 실행합니다. 이미 로그인된 상태로 열렸다면
// 바로 실행합니다.
function runAfterAdminLogin(callback) {
  const dashboard = document.querySelector('#dashboard');
  if (!dashboard || !dashboard.hasAttribute('hidden')) {
    callback();
    return;
  }
  const observer = new MutationObserver(() => {
    if (!dashboard.hasAttribute('hidden')) {
      observer.disconnect();
      callback();
    }
  });
  observer.observe(dashboard, { attributes: true, attributeFilter: ['hidden'] });
}

function createSectionBackgroundEditor(opts) {
  const $ = (sel) => document.querySelector(sel);

  const fileInput = $(opts.fileInputId);
  const previewWrap = $(opts.previewWrapId);
  const previewImg = $(opts.previewImgId);
  const marker = $(opts.markerId);
  const emptyHint = $(opts.emptyHintId);
  const zoomInput = $(opts.zoomInputId);
  const zoomValueLabel = $(opts.zoomValueId);
  const saveBtn = $(opts.saveBtnId);
  const statusEl = $(opts.statusId);

  if (!fileInput || !saveBtn) return; // 이 카드가 없는 페이지에서는 조용히 종료

  // 현재 상태 (서버에 보낼 값)
  let state = { backgroundImage: '', focalX: 50, focalY: 50, zoom: 100 };

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
      if (!res.ok) {
        setStatus(`불러오기 실패 (서버 응답 ${res.status}). 로그인 상태를 확인해주세요.`, true);
        return;
      }
      const site = await res.json();
      const cfg = site && site[opts.siteKey];
      if (cfg && cfg.backgroundImage) {
        state = {
          backgroundImage: cfg.backgroundImage,
          focalX: cfg.focalX != null ? cfg.focalX : 50,
          focalY: cfg.focalY != null ? cfg.focalY : 50,
          zoom: cfg.zoom || 100
        };
        zoomInput.value = state.zoom;
        zoomValueLabel.textContent = state.zoom;
        showPreview(state.backgroundImage);
      }
    } catch (err) {
      console.error(opts.label + ' 배경 불러오기 실패:', err);
      setStatus('불러오기 중 오류가 발생했어요: ' + err.message, true);
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
        body: JSON.stringify({ [opts.siteKey]: state })
      });
      if (!res.ok) {
        let detail = `서버 응답 ${res.status}`;
        try {
          const errBody = await res.json();
          if (errBody && errBody.error) detail += `: ${errBody.error}`;
        } catch (parseErr) {
          // 응답이 JSON이 아니면(로그인 페이지 HTML 등) 상태 코드만 표시
        }
        throw new Error(detail);
      }
      setStatus('저장되었습니다. 홈페이지에서 확인해보세요.', false);
    } catch (err) {
      setStatus('저장 실패: ' + err.message, true);
    }
  });

  runAfterAdminLogin(loadCurrent);
}

createSectionBackgroundEditor({
  label: '예배 안내',
  siteKey: 'service',
  fileInputId: '#s-serviceImageFile',
  previewWrapId: '#s-serviceBgPreviewWrap',
  previewImgId: '#s-serviceBgPreviewImg',
  markerId: '#s-serviceBgFocalMarker',
  emptyHintId: '#s-serviceBgEmptyHint',
  zoomInputId: '#s-serviceZoom',
  zoomValueId: '#s-serviceZoomValue',
  saveBtnId: '#s-serviceBgSaveBtn',
  statusId: '#s-serviceBgStatus'
});

createSectionBackgroundEditor({
  label: '찬양',
  siteKey: 'praise',
  fileInputId: '#s-praiseImageFile',
  previewWrapId: '#s-praiseBgPreviewWrap',
  previewImgId: '#s-praiseBgPreviewImg',
  markerId: '#s-praiseBgFocalMarker',
  emptyHintId: '#s-praiseBgEmptyHint',
  zoomInputId: '#s-praiseZoom',
  zoomValueId: '#s-praiseZoomValue',
  saveBtnId: '#s-praiseBgSaveBtn',
  statusId: '#s-praiseBgStatus'
});

createSectionBackgroundEditor({
  label: '설교 영상',
  siteKey: 'sermon',
  fileInputId: '#s-sermonImageFile',
  previewWrapId: '#s-sermonBgPreviewWrap',
  previewImgId: '#s-sermonBgPreviewImg',
  markerId: '#s-sermonBgFocalMarker',
  emptyHintId: '#s-sermonBgEmptyHint',
  zoomInputId: '#s-sermonZoom',
  zoomValueId: '#s-sermonZoomValue',
  saveBtnId: '#s-sermonBgSaveBtn',
  statusId: '#s-sermonBgStatus'
});

createSectionBackgroundEditor({
  label: '선교',
  siteKey: 'missionsBg',
  fileInputId: '#s-missionsImageFile',
  previewWrapId: '#s-missionsBgPreviewWrap',
  previewImgId: '#s-missionsBgPreviewImg',
  markerId: '#s-missionsBgFocalMarker',
  emptyHintId: '#s-missionsBgEmptyHint',
  zoomInputId: '#s-missionsZoom',
  zoomValueId: '#s-missionsZoomValue',
  saveBtnId: '#s-missionsBgSaveBtn',
  statusId: '#s-missionsBgStatus'
});

// ===================================================================
// 예배 시간별 세부 설정(굵게 / 글자 크기 / 설명) — 관리자 화면 연동 스크립트
// 기존 예배 시간 목록(#service-list)은 별도 관리자 스크립트가 렌더링하므로,
// 여기서는 건드리지 않고 별도의 편집 영역으로 세부 설정만 관리합니다.
// ===================================================================
(function () {
  const $ = (sel) => document.querySelector(sel);

  const listWrap = $('#s-serviceBoldList');
  const saveBtn = $('#s-serviceBoldSaveBtn');
  const statusEl = $('#s-serviceBoldStatus');

  if (!listWrap || !saveBtn) return;

  function escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#b3413a' : '#2f6d3a';
  }

  const FONT_SIZES = [
    { value: 'sm', label: '작게' },
    { value: 'md', label: '기본' },
    { value: 'lg', label: '크게' }
  ];

  async function loadList() {
    try {
      const res = await fetch('/api/admin/site', { credentials: 'include' });
      const site = await res.json();
      const times = site.serviceTimes || [];
      if (!times.length) {
        listWrap.innerHTML = '<p class="hint" style="margin:0;">등록된 예배 시간이 없습니다.</p>';
        return;
      }
      listWrap.innerHTML = times
        .map(
          (s) => `
          <div style="border:1px solid var(--line); border-radius:8px; padding:14px;" data-service-id="${s.id}">
            <p style="margin:0 0 10px; font-weight:600;">${escapeHtml(s.name)} (${escapeHtml(s.time)})</p>
            <div class="field-checkbox" style="margin-bottom:10px;">
              <label>
                <input type="checkbox" class="s-bold-input" ${s.bold ? 'checked' : ''} />
                굵게 표시
              </label>
            </div>
            <div class="field" style="margin-bottom:10px;">
              <label style="font-size:0.85rem;">글자 크기</label>
              <select class="s-fontsize-input">
                ${FONT_SIZES.map(
                  (f) => `<option value="${f.value}" ${(s.fontSize || 'md') === f.value ? 'selected' : ''}>${f.label}</option>`
                ).join('')}
              </select>
            </div>
            <div class="field" style="margin-bottom:0;">
              <label style="font-size:0.85rem;">설명 (선택 사항, 예: 온 가족이 함께 드리는 예배입니다)</label>
              <textarea class="s-description-input" rows="2" placeholder="이 예배에 대한 간단한 설명을 입력하세요">${escapeHtml(s.description || '')}</textarea>
            </div>
          </div>`
        )
        .join('');
    } catch (err) {
      console.error('예배 시간 목록 불러오기 실패:', err);
      setStatus('목록을 불러오지 못했습니다.', true);
    }
  }

  saveBtn.addEventListener('click', async () => {
    setStatus('저장 중...', false);
    try {
      // 저장 직전에 최신 상태를 다시 받아와서, 그 사이 다른 화면에서 예배 시간이
      // 추가/삭제/수정됐어도 안전하게 병합합니다.
      const res = await fetch('/api/admin/site', { credentials: 'include' });
      const site = await res.json();

      const edits = {};
      listWrap.querySelectorAll('[data-service-id]').forEach((row) => {
        const id = row.dataset.serviceId;
        edits[id] = {
          bold: row.querySelector('.s-bold-input').checked,
          fontSize: row.querySelector('.s-fontsize-input').value,
          description: row.querySelector('.s-description-input').value.trim()
        };
      });

      const updatedTimes = (site.serviceTimes || []).map((s) =>
        edits[s.id] ? { ...s, ...edits[s.id] } : s
      );

      const saveRes = await fetch('/api/admin/site', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceTimes: updatedTimes })
      });
      if (!saveRes.ok) throw new Error('저장 실패');
      setStatus('저장되었습니다. 홈페이지에서 확인해보세요.', false);
    } catch (err) {
      setStatus('저장 실패: ' + err.message, true);
    }
  });

  runAfterAdminLogin(loadList);
})();

// ===================================================================
// 섬김 안내 (팝업 제목 / 소제목 2개 / 내용 2개) — 관리자 화면 연동 스크립트
// ===================================================================
(function () {
  const $ = (sel) => document.querySelector(sel);

  const titleInput = $('#s-ministryTitle');
  const worshipLabelInput = $('#s-ministryWorshipLabel');
  const worshipInput = $('#s-ministryWorship');
  const mealLabelInput = $('#s-ministryMealLabel');
  const mealInput = $('#s-ministryMeal');
  const saveBtn = $('#s-ministryDutySaveBtn');
  const statusEl = $('#s-ministryDutyStatus');

  if (!worshipInput || !mealInput || !saveBtn) return;

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#b3413a' : '#2f6d3a';
  }

  async function loadCurrent() {
    try {
      const res = await fetch('/api/admin/site', { credentials: 'include' });
      if (!res.ok) {
        setStatus(`불러오기 실패 (서버 응답 ${res.status}). 로그인 상태를 확인해주세요.`, true);
        return;
      }
      const site = await res.json();
      const duty = site && site.ministryDuty;
      if (titleInput) titleInput.value = (duty && duty.title) || '';
      if (worshipLabelInput) worshipLabelInput.value = (duty && duty.worshipLabel) || '';
      worshipInput.value = (duty && duty.worship) || '';
      if (mealLabelInput) mealLabelInput.value = (duty && duty.mealLabel) || '';
      mealInput.value = (duty && duty.meal) || '';
    } catch (err) {
      setStatus('불러오기 중 오류가 발생했어요: ' + err.message, true);
    }
  }

  saveBtn.addEventListener('click', async () => {
    setStatus('저장 중...', false);
    try {
      const res = await fetch('/api/admin/site', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ministryDuty: {
            title: titleInput ? titleInput.value : '',
            worshipLabel: worshipLabelInput ? worshipLabelInput.value : '',
            worship: worshipInput.value,
            mealLabel: mealLabelInput ? mealLabelInput.value : '',
            meal: mealInput.value
          }
        })
      });
      if (!res.ok) {
        let detail = `서버 응답 ${res.status}`;
        try {
          const errBody = await res.json();
          if (errBody && errBody.error) detail += `: ${errBody.error}`;
        } catch (parseErr) {
          // 무시
        }
        throw new Error(detail);
      }
      setStatus('저장되었습니다. 홈페이지에서 확인해보세요.', false);
    } catch (err) {
      setStatus('저장 실패: ' + err.message, true);
    }
  });

  runAfterAdminLogin(loadCurrent);
})();

// ===================================================================
// 선교사님 소개 카드 (몇 개든 추가 가능) — 관리자 화면 연동 스크립트
// ===================================================================
(function () {
  const $ = (sel) => document.querySelector(sel);
  const wrap = $('#mission-cards-admin');
  const addBtn = $('#mission-card-add-btn');
  const saveBtn = $('#mission-cards-save-btn');
  const statusEl = $('#mission-cards-save-status');
  if (!wrap || !saveBtn) return;

  let nextBlockId = 1;

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#b3413a' : '#2f6d3a';
  }

  function addBlock(card) {
    const c = card || {};
    const blockId = nextBlockId;
    nextBlockId += 1;

    const block = document.createElement('div');
    block.className = 'card';
    block.style.background = '#faf9f5';
    block.dataset.loadedPhoto = c.photo || ''; // 처음 불러온 사진 주소를 이 블록에만 안전하게 보관 (다른 카드에 영향 없음)
    block.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <h4 style="margin:0;">카드</h4>
        <button type="button" class="btn-secondary mc-remove-btn" style="padding:4px 10px; font-size:12px;">삭제</button>
      </div>
      <div class="field"><label>나라명</label><input type="text" class="mc-country" placeholder="예: 케냐" value="${(c.country || '').replace(/"/g, '&quot;')}" /></div>
      <div class="field"><label>선교사님 성함</label><input type="text" class="mc-name" placeholder="홍길동 선교사" value="${(c.name || '').replace(/"/g, '&quot;')}" /></div>
      <div class="field"><label>사역 내용 (여러 줄 가능)</label><textarea class="mc-content" rows="3" placeholder="현지에서 어떤 사역을 하고 계신지 소개해주세요.">${(c.content || '')}</textarea></div>
      <div class="field">
        <label>사진 (교체하려면 다시 선택)</label>
        <input type="file" class="mc-photo-file" accept="image/*" />
        <img class="preview mc-photo-preview" src="${c.photo || ''}" style="max-width:120px; border-radius:50%; margin-top:8px; ${c.photo ? '' : 'display:none;'}" />
      </div>
    `;
    wrap.appendChild(block);

    const fileInput = block.querySelector('.mc-photo-file');
    const previewImg = block.querySelector('.mc-photo-preview');
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      block.pendingFile = file; // 블록 DOM 노드 자체에 보관 — 다른 카드와 절대 안 섞임
      previewImg.src = URL.createObjectURL(file);
      previewImg.style.display = '';
    });

    block.querySelector('.mc-remove-btn').addEventListener('click', () => {
      block.remove();
    });

    return blockId;
  }

  function renderForm(cards) {
    wrap.innerHTML = '';
    const list = cards && cards.length ? cards : [{}, {}, {}]; // 처음엔 빈 카드 3개로 시작
    list.forEach((c) => addBlock(c));
  }

  async function loadCurrent() {
    try {
      const res = await fetch('/api/admin/site', { credentials: 'include' });
      if (!res.ok) {
        setStatus(`불러오기 실패 (서버 응답 ${res.status}). 로그인 상태를 확인해주세요.`, true);
        renderForm([]);
        return;
      }
      const site = await res.json();
      const cards = (site && site.missions && site.missions.cards) || [];
      renderForm(cards);
    } catch (err) {
      setStatus('불러오기 중 오류가 발생했어요: ' + err.message, true);
      renderForm([]);
    }
  }

  async function uploadFile(file) {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/admin/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    if (!res.ok) throw new Error(`이미지 업로드 실패 (서버 응답 ${res.status})`);
    const data = await res.json();
    if (!data || !data.url) throw new Error('업로드 응답에 이미지 주소가 없습니다.');
    return data.url;
  }

  if (addBtn) {
    addBtn.addEventListener('click', () => addBlock({}));
  }

  saveBtn.addEventListener('click', async () => {
    setStatus('저장 중...', false);
    try {
      const blocks = Array.from(wrap.querySelectorAll('.card'));
      const cards = [];
      for (const block of blocks) {
        // 사진을 새로 고른 카드만 업로드하고, 나머지는 그 블록이 처음 불러온 주소를 그대로 씁니다.
        let photo = block.dataset.loadedPhoto || '';
        if (block.pendingFile) {
          photo = await uploadFile(block.pendingFile);
        }
        cards.push({
          country: block.querySelector('.mc-country').value,
          name: block.querySelector('.mc-name').value,
          content: block.querySelector('.mc-content').value,
          photo
        });
      }
      const res = await fetch('/api/admin/site', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missions: { cards } })
      });
      if (!res.ok) {
        let detail = `서버 응답 ${res.status}`;
        try {
          const errBody = await res.json();
          if (errBody && errBody.error) detail += `: ${errBody.error}`;
        } catch (parseErr) {
          // 무시
        }
        throw new Error(detail);
      }
      blocks.forEach((block, i) => {
        block.dataset.loadedPhoto = cards[i].photo || '';
        block.pendingFile = null;
      });
      setStatus('저장되었습니다. 홈페이지에서 확인해보세요.', false);
    } catch (err) {
      setStatus('저장 실패: ' + err.message, true);
    }
  });

  runAfterAdminLogin(loadCurrent);
})();
