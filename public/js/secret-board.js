// 기도 요청(prayer.html) / 온라인 문의(inquiry.html) 공용 스크립트
// <body data-api-base="prayers 또는 inquiries" data-success-message="...">로 동작을 구분합니다.
// data-always-secret="true" 이면 비밀글 선택 없이 항상 비밀번호로 잠그고,
// data-mask-names="true" 이면 목록에 표시되는 이름을 항상 일부 가립니다(예: 홍**).
(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const apiBase = document.body.dataset.apiBase || 'prayers';
  const successMessage = document.body.dataset.successMessage || '등록되었습니다 🙏';
  const alwaysSecret = document.body.dataset.alwaysSecret === 'true';
  const maskNames = document.body.dataset.maskNames === 'true';

  function escapeHtml(str = '') {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 이름 마스킹: 첫 글자만 남기고 나머지는 별표 처리 (예: "홍길동" → "홍**")
  function maskName(name = '') {
    const trimmed = (name || '').trim();
    if (!trimmed) return '익명';
    if (trimmed.length <= 1) return trimmed;
    return trimmed[0] + '*'.repeat(trimmed.length - 1);
  }

  function displayName(name) {
    const base = name || '익명';
    return maskNames ? maskName(base) : base;
  }

  $('#board-year').textContent = new Date().getFullYear();

  fetch('/api/site')
    .then((res) => res.json())
    .then((site) => {
      if (site && site.churchName) {
        document.title = `${document.title} | ${site.churchName}`;
        $('#board-brand').textContent = site.churchName;
        $('#board-footer-name').textContent = site.churchName;
      }
    })
    .catch(() => {});

  function cardHTML(p) {
    const nameStr = escapeHtml(displayName(p.name));
    const dateStr = escapeHtml(p.date || '');
    if (p.secret) {
      return `
        <div class="prayer-card prayer-card--secret" data-id="${p.id}">
          <div class="prayer-card-head">
            <span class="prayer-name">${nameStr}</span>
            <span class="prayer-date">${dateStr}</span>
          </div>
          <p class="prayer-locked">🔒 비밀글입니다. 작성 시 입력한 비밀번호로 확인할 수 있어요.</p>
          <form class="prayer-unlock-form">
            <input type="password" placeholder="비밀번호" required />
            <button type="submit">확인</button>
          </form>
          <p class="prayer-unlock-error"></p>
        </div>`;
    }
    return `
      <div class="prayer-card" data-id="${p.id}">
        <div class="prayer-card-head">
          <span class="prayer-name">${nameStr}</span>
          <span class="prayer-date">${dateStr}</span>
        </div>
        <p class="prayer-content">${escapeHtml(p.content || '').replace(/\n/g, '<br>')}</p>
      </div>`;
  }

  function bindUnlockForms() {
    $$('.prayer-unlock-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const card = form.closest('.prayer-card');
        const id = card.dataset.id;
        const pwInput = form.querySelector('input[type="password"]');
        const errEl = card.querySelector('.prayer-unlock-error');
        errEl.textContent = '';
        try {
          const res = await fetch(`/api/${apiBase}/${id}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pwInput.value })
          });
          const data = await res.json();
          if (!res.ok) {
            errEl.textContent = data.error || '비밀번호가 일치하지 않습니다.';
            return;
          }
          card.classList.remove('prayer-card--secret');
          const replyHtml = data.reply
            ? `<div style="margin-top:10px; padding-top:10px; border-top:1px dashed var(--line);">
                 <p style="margin:0 0 4px; font-size:0.8rem; font-weight:700; color:var(--gold-deep);">담당자 답글</p>
                 <p class="prayer-content" style="margin:0;">${escapeHtml(data.reply).replace(/\n/g, '<br>')}</p>
               </div>`
            : '';
          card.innerHTML = `
            <div class="prayer-card-head">
              <span class="prayer-name">${escapeHtml(displayName(data.name))}</span>
              <span class="prayer-date">${escapeHtml(data.date || '')}</span>
              <span class="prayer-unlocked-badge">🔓 확인됨</span>
            </div>
            <p class="prayer-content">${escapeHtml(data.content || '').replace(/\n/g, '<br>')}</p>
            ${replyHtml}`;
        } catch (err) {
          errEl.textContent = '확인 중 오류가 발생했습니다.';
        }
      });
    });
  }

  async function loadList() {
    const listEl = $('#board-list');
    if (!listEl) return;
    try {
      const res = await fetch(`/api/${apiBase}`);
      const list = await res.json();
      if (!list || list.length === 0) {
        listEl.innerHTML = `<p class="prayer-empty">아직 등록된 글이 없습니다. 첫 번째로 남겨주세요.</p>`;
        return;
      }
      listEl.innerHTML = list.slice(0, 20).map(cardHTML).join('');
      bindUnlockForms();
    } catch (err) {
      listEl.innerHTML = `<p class="prayer-empty">목록을 불러오지 못했습니다.</p>`;
    }
  }

  function setupForm() {
    const form = $('#board-form');
    if (!form) return;
    const secretCheckbox = $('#board-secret'); // alwaysSecret 페이지(온라인 문의)에는 이제 이 요소가 없음
    const passwordInput = $('#board-password');
    const statusEl = $('#board-form-status');

    if (alwaysSecret) {
      // 체크박스 자체가 없으므로, 비밀번호 입력란을 항상 필수로 보여줍니다.
      passwordInput.style.display = '';
      passwordInput.required = true;
    } else {
      // 페이지 로드 시 체크박스 기본값(inquiry.html은 기본 체크됨)에 맞춰 비밀번호 입력란을 미리 보여줌
      passwordInput.style.display = secretCheckbox.checked ? '' : 'none';
      passwordInput.required = secretCheckbox.checked;

      secretCheckbox.addEventListener('change', () => {
        const on = secretCheckbox.checked;
        passwordInput.style.display = on ? '' : 'none';
        passwordInput.required = on;
        if (!on) passwordInput.value = '';
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = $('#board-content').value.trim();
      const secret = alwaysSecret ? true : secretCheckbox.checked;
      const password = passwordInput.value;
      if (!content) return;
      if (secret && password.length < 4) {
        statusEl.textContent = '비밀번호는 4자 이상 입력해주세요.';
        statusEl.style.color = '#b3413a';
        return;
      }
      statusEl.textContent = '등록 중...';
      statusEl.style.color = '';
      try {
        const res = await fetch(`/api/${apiBase}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: $('#board-name').value.trim(), content, secret, password })
        });
        const data = await res.json();
        if (!res.ok) {
          statusEl.textContent = data.error || '등록에 실패했습니다.';
          statusEl.style.color = '#b3413a';
          return;
        }
        form.reset();
        if (alwaysSecret) {
          passwordInput.style.display = '';
        } else {
          passwordInput.style.display = secretCheckbox.checked ? '' : 'none';
        }
        statusEl.textContent = successMessage;
        statusEl.style.color = 'var(--gold)';
        loadList();
      } catch (err) {
        statusEl.textContent = '등록 중 오류가 발생했습니다.';
        statusEl.style.color = '#b3413a';
      }
    });
  }

  setupForm();
  loadList();
})();
