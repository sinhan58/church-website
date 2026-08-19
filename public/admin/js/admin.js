(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let currentSession = null; // { username, role, permissions }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    if (res.status === 401) {
      showLogin();
      throw new Error('로그인이 필요합니다.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '요청 처리 중 오류가 발생했습니다.');
    return data;
  }

  async function uploadImage(file) {
    const form = new FormData();
    form.append('image', file);
    const res = await fetch('/api/admin/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '이미지 업로드 실패');
    return data.url;
  }

  async function uploadAttachments(files) {
    const form = new FormData();
    Array.from(files).forEach((f) => form.append('files', f));
    const res = await fetch('/api/admin/upload-attachment', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '첨부파일 업로드 실패');
    return data.files; // [{name, url}]
  }

  // ---------------- 화면 전환 ----------------
  function showLogin() {
    $('#login-screen').hidden = false;
    $('#dashboard').hidden = true;
  }
  function showDashboard() {
    $('#login-screen').hidden = true;
    $('#dashboard').hidden = false;
    initDashboard();
  }

  // ---------------- 로그인 ----------------
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const username = form.username.value;
    const password = form.password.value;
    const errorEl = $('#login-error');
    errorEl.textContent = '';
    try {
      const result = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      currentSession = { username: result.username, role: result.role, permissions: result.permissions };
      showDashboard();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  $('#logout-btn').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    showLogin();
  });

  async function checkSession() {
    try {
      const session = await api('/api/admin/session');
      if (session.isAdmin) {
        currentSession = { username: session.username, role: session.role, permissions: session.permissions };
        showDashboard();
      } else {
        showLogin();
      }
    } catch {
      showLogin();
    }
  }

  // ---------------- 사이드바 탭 전환 ----------------
  let dashboardInitialized = false;
  function setupNav() {
    const sidebarNav = $('#sidebar-nav');
    const toggleBtn = $('#sidebar-toggle-btn');
    const toggleCurrentLabel = $('#sidebar-toggle-current');

    // 모바일: 메뉴 접기/펴기 버튼
    if (toggleBtn && sidebarNav) {
      toggleBtn.addEventListener('click', () => {
        sidebarNav.classList.toggle('open');
      });
    }

    $$('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.nav-item').forEach((b) => b.classList.remove('active'));
        $$('.panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        $('#' + btn.dataset.panel).classList.add('active');

        // 모바일에서 메뉴를 고르면 자동으로 접어서, 바로 그 화면 내용이 보이게 합니다.
        if (toggleCurrentLabel) toggleCurrentLabel.textContent = btn.textContent;
        if (sidebarNav) sidebarNav.classList.remove('open');
      });
    });
  }

  let postEditor = null;

  // ---------------- 기도 요청 / 온라인 문의 (관리자 확인) ----------------
  // key: 'prayers' 또는 'inquiries'. inquiries만 답글 입력창 + 답변완료 배지를 보여줍니다.
  function setupSecretBoardAdminPanel(key, { listElId, refreshBtnId, withReply, showSecretBadge }) {
    const listEl = $('#' + listElId);
    const refreshBtn = $('#' + refreshBtnId);
    if (!listEl || !refreshBtn) return;

    function statusBadgeHTML(item) {
      if (!withReply) return '';
      const answered = !!(item.reply && item.reply.trim());
      const bg = answered ? '#2f6d3a' : '#b3413a';
      const label = answered ? '답변완료' : '미답변';
      return `<span class="status-badge" data-id="${item.id}" style="margin-left:8px; padding:2px 10px; border-radius:999px; font-size:0.76rem; font-weight:700; background:${bg}; color:#fff;">${label}</span>`;
    }

    function cardHTML(item) {
      const dateStr = escapeHtml(item.date || '');
      const nameStr = escapeHtml(item.name || '익명');
      const contentStr = escapeHtml(item.content || '').replace(/\n/g, '<br>');
      const secretBadge = showSecretBadge && item.secret ? '<span class="badge" style="margin-left:8px;">🔒 비밀글</span>' : '';
      const replyBlock = withReply
        ? `
          <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #ddd;">
            <textarea class="reply-input" data-id="${item.id}" rows="2" placeholder="답글을 입력하세요 (작성자가 본인 비밀번호로 다시 열어보면 보여요)" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ddd; border-radius:6px; font-family:inherit; font-size:0.85rem;">${escapeHtml(item.reply || '')}</textarea>
            <button type="button" class="btn-secondary reply-save-btn" data-id="${item.id}" style="margin-top:6px;">답글 저장</button>
            <span class="reply-status" data-id="${item.id}" style="margin-left:8px; font-size:0.82rem; color:#8f6b17;"></span>
          </div>`
        : '';
      return `
        <div class="post-row" data-id="${item.id}" style="display:block; padding:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <div>
              <strong>${nameStr}</strong>
              <span class="hint" style="margin-left:8px;">${dateStr}</span>
              ${secretBadge}${statusBadgeHTML(item)}
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn-secondary board-toggle-btn" data-id="${item.id}">내용보기</button>
              <button type="button" class="btn-secondary board-delete-btn" data-id="${item.id}">삭제</button>
            </div>
          </div>
          <div class="board-detail" data-id="${item.id}" style="display:none; margin-top:10px;">
            <p style="margin:0; white-space:pre-wrap; word-break:keep-all;">${contentStr}</p>
            ${replyBlock}
          </div>
        </div>`;
    }

    async function load() {
      listEl.innerHTML = `<p class="hint">불러오는 중...</p>`;
      try {
        const list = await api(`/api/admin/${key}`);
        if (!list || list.length === 0) {
          listEl.innerHTML = `<p class="hint">등록된 글이 없습니다.</p>`;
          return;
        }
        listEl.innerHTML = list.map(cardHTML).join('');
        bindRowActions();
      } catch (err) {
        listEl.innerHTML = `<p class="hint">불러오지 못했습니다: ${escapeHtml(err.message)}</p>`;
      }
    }

    function bindRowActions() {
      $$('.board-toggle-btn', listEl).forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const detail = listEl.querySelector(`.board-detail[data-id="${id}"]`);
          const isOpen = detail.style.display !== 'none';
          detail.style.display = isOpen ? 'none' : 'block';
          btn.textContent = isOpen ? '내용보기' : '접기';
        });
      });

      $$('.board-delete-btn', listEl).forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('이 글을 삭제하시겠습니까?')) return;
          try {
            await api(`/api/admin/${key}/${btn.dataset.id}`, { method: 'DELETE' });
            load();
          } catch (err) {
            alert(err.message);
          }
        });
      });

      if (withReply) {
        $$('.reply-save-btn', listEl).forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const textarea = listEl.querySelector(`.reply-input[data-id="${id}"]`);
            const statusEl = listEl.querySelector(`.reply-status[data-id="${id}"]`);
            const replyText = textarea.value.trim();
            statusEl.textContent = '저장 중...';
            try {
              await api(`/api/admin/${key}/${id}/reply`, {
                method: 'PUT',
                body: JSON.stringify({ reply: replyText })
              });
              statusEl.textContent = '저장 완료 ✓';
              setTimeout(() => (statusEl.textContent = ''), 2500);
              // 목록을 통째로 다시 불러오지 않고, 방금 저장한 행의 배지만 바로 바꿔줍니다.
              // (전체 새로고침을 하면 펼쳐둔 내용이 다시 접혀버려서 불편하기 때문)
              const badgeEl = listEl.querySelector(`.status-badge[data-id="${id}"]`);
              if (badgeEl) {
                const answered = !!replyText;
                badgeEl.textContent = answered ? '답변완료' : '미답변';
                badgeEl.style.background = answered ? '#2f6d3a' : '#b3413a';
              }
            } catch (err) {
              statusEl.textContent = '저장 실패: ' + err.message;
            }
          });
        });
      }
    }

    refreshBtn.addEventListener('click', load);
    load();
  }

  function setupPrayersAdminPanel() {
    setupSecretBoardAdminPanel('prayers', {
      listElId: 'prayers-admin-list',
      refreshBtnId: 'prayers-refresh-btn',
      withReply: false,
      showSecretBadge: true // 기도 요청은 비밀글 여부를 직접 선택하므로 표시가 의미 있음
    });
  }

  function setupInquiriesAdminPanel() {
    setupSecretBoardAdminPanel('inquiries', {
      listElId: 'inquiries-admin-list',
      refreshBtnId: 'inquiries-refresh-btn',
      withReply: true,
      showSecretBadge: false // 온라인 문의는 항상 비밀글이라 표시가 불필요함
    });
  }

  // ---------------- 말씀 퀴즈 관리 ----------------
  // 서버(routes/admin.js)와 같은 규칙으로 괄호 안 단어를 빈칸으로 파싱합니다.
  // 괄호가 없는 줄 = 새 성경 출처(참조) 시작, 괄호가 있는 줄 = 그 출처의 문제 내용.
  // 참조 줄 없이 바로 내용부터 시작하면, 폼에 입력해둔 '본문 출처' 값을 기본으로 사용합니다.
  function parseQuizPaste(raw, defaultReference) {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const verses = [];
    let currentRef = null;

    lines.forEach((line) => {
      const hasBlank = /\(([^)]*)\)/.test(line);
      if (!hasBlank) {
        currentRef = line;
        return;
      }
      const reference = currentRef || defaultReference || '';
      const m = line.match(/^(\d+)\s+(.*)$/);
      if (m) {
        verses.push({ reference, verseLabel: m[1], rawText: m[2] });
      } else {
        verses.push({ reference, verseLabel: '', rawText: line });
      }
    });

    return verses;
  }

  function renderQuizPreviewVerse(v) {
    const withBlanks = (v.rawText || '').replace(/\(([^)]+)\)/g, () => '____');
    const label = [v.reference, v.verseLabel].filter(Boolean).join(' ');
    return `<p style="margin:0 0 10px; line-height:1.8;"><strong>${escapeHtml(label)}</strong> ${escapeHtml(withBlanks)}</p>`;
  }

  function setupQuizAdminPanel() {
    const refInput = $('#quiz-reference-input');
    const weekInput = $('#quiz-week-input');
    const pasteInput = $('#quiz-paste-input');
    const previewBtn = $('#quiz-preview-btn');
    const previewBox = $('#quiz-preview-box');
    const registerBtn = $('#quiz-register-btn');
    const cancelEditBtn = $('#quiz-cancel-edit-btn');
    const formTitleEl = $('#quiz-form-title');
    const statusEl = $('#quiz-save-status');
    const listEl = $('#quiz-admin-list');
    const refreshBtn = $('#quiz-list-refresh-btn');

    if (!refInput) return; // 권한이 없어 패널 자체가 없는 부관리자는 조용히 건너뜀

    let editingQuizId = null; // null이면 '새로 등록', 값이 있으면 '그 퀴즈 수정 중'

    // 서버에 저장된 markedText({{b1}} 등)+blanks(정답)를 다시 "(정답)" 형태의
    // 원본 붙여넣기 텍스트로 되돌립니다. '수정하기'를 눌렀을 때 폼에 그대로 채워 넣기 위함입니다.
    function reconstructRawText(v) {
      let text = v.markedText;
      v.blanks.forEach((b) => {
        text = text.replace(`{{${b.id}}}`, `(${b.answer})`);
      });
      return text;
    }

    function resetForm() {
      editingQuizId = null;
      refInput.value = '';
      weekInput.value = '';
      pasteInput.value = '';
      previewBox.style.display = 'none';
      registerBtn.textContent = '이번 주 퀴즈로 등록';
      if (formTitleEl) formTitleEl.textContent = '새 퀴즈 등록';
      if (cancelEditBtn) cancelEditBtn.hidden = true;
    }

    function loadQuizIntoForm(q) {
      editingQuizId = q.id;
      refInput.value = q.reference || '';
      weekInput.value = q.weekLabel || '';

      const lines = [];
      let lastRef = null;
      q.verses.forEach((v) => {
        if (v.reference && v.reference !== lastRef) {
          lines.push(v.reference);
          lastRef = v.reference;
        }
        const prefix = v.verseLabel ? `${v.verseLabel} ` : '';
        lines.push(`${prefix}${reconstructRawText(v)}`);
      });
      pasteInput.value = lines.join('\n');

      previewBox.style.display = 'none';
      registerBtn.textContent = '수정 내용 저장';
      if (formTitleEl) formTitleEl.textContent = '퀴즈 수정 중';
      if (cancelEditBtn) cancelEditBtn.hidden = false;
      refInput.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function doPreview() {
      const verses = parseQuizPaste(pasteInput.value, refInput.value.trim());
      if (verses.length === 0) {
        previewBox.style.display = 'block';
        previewBox.innerHTML = `<p class="hint">붙여넣은 내용에서 절을 찾지 못했어요. "3 그러므로..." 처럼 절 번호로 시작하는지 확인해주세요.</p>`;
        return;
      }
      const totalBlanks = verses.reduce((sum, v) => {
        const matches = v.rawText.match(/\(([^)]+)\)/g) || [];
        return sum + matches.length;
      }, 0);
      previewBox.style.display = 'block';
      previewBox.innerHTML = `
        <p class="hint" style="margin-bottom:10px;">${verses.length}개 절 · 빈칸 ${totalBlanks}개로 인식됐어요.</p>
        ${verses.map(renderQuizPreviewVerse).join('')}`;
    }

    previewBtn.addEventListener('click', doPreview);

    if (cancelEditBtn) {
      cancelEditBtn.addEventListener('click', resetForm);
    }

    registerBtn.addEventListener('click', async () => {
      const reference = refInput.value.trim();
      const verses = parseQuizPaste(pasteInput.value, refInput.value.trim());
      if (!reference) return alert('본문 출처를 입력해주세요.');
      if (verses.length === 0) return alert('본문 내용을 붙여넣어주세요.');

      const isEditing = !!editingQuizId;
      statusEl.textContent = isEditing ? '수정 저장 중...' : '등록 중...';
      try {
        let savedQuiz;
        if (isEditing) {
          savedQuiz = await api(`/api/admin/quiz/${editingQuizId}`, {
            method: 'PUT',
            body: JSON.stringify({ reference, weekLabel: weekInput.value.trim(), verses })
          });
        } else {
          savedQuiz = await api('/api/admin/quiz', {
            method: 'POST',
            body: JSON.stringify({ reference, weekLabel: weekInput.value.trim(), verses })
          });
        }
        await maybeScheduleLinkedPush({
          checkboxId: 'quiz-schedule-push-check',
          timeInputId: 'quiz-schedule-push-time',
          linkedType: 'quiz',
          linkedId: savedQuiz.id,
          title: `이번 주 말씀 퀴즈: ${reference}`,
          url: '/quiz.html'
        });
        statusEl.textContent = isEditing ? '수정 완료 ✓' : '등록 완료 ✓';
        setTimeout(() => (statusEl.textContent = ''), 2500);
        resetForm();
        loadQuizList();
      } catch (err) {
        statusEl.textContent = (isEditing ? '수정 실패: ' : '등록 실패: ') + err.message;
      }
    });

    function quizRowHTML(q) {
      const blankCount = q.verses.reduce((sum, v) => sum + v.blanks.length, 0);
      return `
        <div class="post-row" data-id="${q.id}" style="display:block; padding:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <div>
              <strong>${escapeHtml(q.reference)}</strong>
              <span class="hint" style="margin-left:8px;">${escapeHtml(q.weekLabel || '')}</span>
              <span class="hint" style="margin-left:8px;">${q.verses.length}절 · 빈칸 ${blankCount}개</span>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn-secondary quiz-edit-btn" data-id="${q.id}">수정</button>
              <button type="button" class="btn-secondary quiz-delete-btn" data-id="${q.id}">삭제</button>
            </div>
          </div>
        </div>`;
    }

    async function loadQuizList() {
      listEl.innerHTML = `<p class="hint">불러오는 중...</p>`;
      try {
        const list = await api('/api/admin/quiz');
        populateQuizStatsSelect(list);
        if (!list || list.length === 0) {
          listEl.innerHTML = `<p class="hint">등록된 퀴즈가 없습니다.</p>`;
          return;
        }
        listEl.innerHTML = list.map(quizRowHTML).join('');
        $$('.quiz-edit-btn', listEl).forEach((btn) => {
          btn.addEventListener('click', () => {
            const quiz = list.find((q) => q.id === btn.dataset.id);
            if (quiz) loadQuizIntoForm(quiz);
          });
        });
        $$('.quiz-delete-btn', listEl).forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm('이 퀴즈를 삭제하시겠습니까? (참여 기록은 남아있어요)')) return;
            try {
              await api(`/api/admin/quiz/${btn.dataset.id}`, { method: 'DELETE' });
              if (editingQuizId === btn.dataset.id) resetForm();
              loadQuizList();
            } catch (err) {
              alert(err.message);
            }
          });
        });
      } catch (err) {
        listEl.innerHTML = `<p class="hint">불러오지 못했습니다: ${escapeHtml(err.message)}</p>`;
      }
    }

    refreshBtn.addEventListener('click', loadQuizList);
    loadQuizList();
    setupQuizStats();
  }

  // ---------------- 말씀 퀴즈: 참여 통계 ----------------
  function quizBadgeFor(percent) {
    if (percent >= 90) return { label: '말씀 박사 🏆' };
    if (percent >= 70) return { label: '은혜의 지식 📖' };
    if (percent >= 50) return { label: '성실한 도전자 🌱' };
    return { label: '다음 주 다시 도전 💪' };
  }

  function populateQuizStatsSelect(list) {
    const select = $('#quiz-stats-select');
    if (!select) return;
    const prevValue = select.value;
    if (!list || list.length === 0) {
      select.innerHTML = `<option value="">등록된 퀴즈가 없습니다</option>`;
      return;
    }
    select.innerHTML = list
      .map((q) => `<option value="${q.id}">${escapeHtml(q.reference)}${q.weekLabel ? ' · ' + escapeHtml(q.weekLabel) : ''}</option>`)
      .join('');
    // 이전에 보고 있던 퀴즈가 목록에 여전히 있으면 선택 유지, 없으면 가장 최근(맨 위) 퀴즈로
    if (prevValue && list.some((q) => q.id === prevValue)) {
      select.value = prevValue;
    }
    loadQuizStats(select.value);
  }

  async function loadQuizStats(quizId) {
    const summaryEl = $('#quiz-stats-summary');
    const listEl = $('#quiz-stats-list');
    if (!summaryEl || !listEl) return;
    if (!quizId) {
      summaryEl.innerHTML = '';
      listEl.innerHTML = '';
      return;
    }
    summaryEl.innerHTML = `<p class="hint">불러오는 중...</p>`;
    listEl.innerHTML = '';
    try {
      const subs = await api(`/api/admin/quiz/${quizId}/submissions`);
      if (!subs || subs.length === 0) {
        summaryEl.innerHTML = `<p class="hint">아직 참여자가 없어요.</p>`;
        return;
      }

      const count = subs.length;
      const avg = Math.round(subs.reduce((sum, s) => sum + s.score, 0) / count);
      const highest = Math.max(...subs.map((s) => s.score));

      const badgeCounts = {};
      subs.forEach((s) => {
        const label = quizBadgeFor(s.score).label;
        badgeCounts[label] = (badgeCounts[label] || 0) + 1;
      });

      summaryEl.innerHTML = `
        <div class="stats-cards" style="margin-top:12px;">
          <div class="stat-card"><div class="num">${count}</div><div class="label">참여자 수</div></div>
          <div class="stat-card"><div class="num">${avg}점</div><div class="label">평균 점수</div></div>
          <div class="stat-card"><div class="num">${highest}점</div><div class="label">최고 점수</div></div>
        </div>
        <div class="stats-bar-list" style="margin-top:16px;">
          ${Object.entries(badgeCounts)
            .map(
              ([label, n]) => `
              <div class="stats-bar-row">
                <div class="stats-bar-label">${label}</div>
                <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${Math.round((n / count) * 100)}%;"></div></div>
                <div class="stats-bar-count">${n}명</div>
              </div>`
            )
            .join('')}
        </div>`;

      listEl.innerHTML = `
        <h3 style="font-size:0.95rem; margin:20px 0 10px;">참여자 상세 목록</h3>
        <div class="post-list">
          ${subs
            .map(
              (s) => `
              <div class="post-row" style="display:flex; padding:12px 14px;">
                <div style="flex:1;">
                  <strong>${escapeHtml(s.name)}</strong>
                  <span class="hint" style="margin-left:8px;">${new Date(s.submittedAt).toLocaleString('ko-KR')}</span>
                </div>
                <div class="hint">${s.correctCount}/${s.totalBlanks}칸 · 한번에 ${s.firstTryCount}개</div>
                <div style="font-weight:700; color:var(--navy-deep); margin-left:14px;">${s.score}점</div>
              </div>`
            )
            .join('')}
        </div>`;
    } catch (err) {
      summaryEl.innerHTML = `<p class="hint">불러오지 못했습니다: ${escapeHtml(err.message)}</p>`;
    }
  }

  function setupQuizStats() {
    const select = $('#quiz-stats-select');
    if (!select) return;
    select.addEventListener('change', () => loadQuizStats(select.value));
  }

  function setupPushPanel() {
    const sendBtn = $('#push-send-btn');
    if (!sendBtn) return; // 권한 없는 부관리자는 조용히 건너뜀
    const statusEl = $('#push-send-status');
    const titleInput = $('#push-title-input');
    const bodyInput = $('#push-body-input');
    const urlInput = $('#push-url-input');

    sendBtn.addEventListener('click', async () => {
      const title = titleInput.value.trim();
      const body = bodyInput.value.trim();
      const url = urlInput.value.trim();
      if (!title) return alert('알림 제목을 입력해주세요.');
      if (!confirm('구독한 모든 방문자에게 알림을 보냅니다. 계속할까요?')) return;

      statusEl.textContent = '발송 중...';
      try {
        const result = await api('/api/admin/push/send', {
          method: 'POST',
          body: JSON.stringify({ title, body, url })
        });
        statusEl.textContent = `발송 완료 ✓ (성공 ${result.sent}건 / 실패 ${result.failed}건)`;
        titleInput.value = '';
        bodyInput.value = '';
        urlInput.value = '';
      } catch (err) {
        statusEl.textContent = '발송 실패: ' + err.message;
      }
    });

    // ---------------- 자주 쓰는 문구 ----------------
    async function loadTemplates() {
      const wrap = $('#push-template-chips');
      try {
        const list = await api('/api/admin/push/templates');
        if (!list || list.length === 0) {
          wrap.innerHTML = `<p class="hint" style="margin:0;">아직 저장된 문구가 없어요. 아래에 입력하고 "이 문구 저장"을 눌러보세요.</p>`;
          return;
        }
        wrap.innerHTML = list
          .map(
            (t) => `
            <span class="badge push-template-chip" data-id="${t.id}" style="cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
              ${escapeHtml(t.name)}
              <button type="button" class="push-template-delete" data-id="${t.id}" style="background:none; border:none; color:inherit; cursor:pointer; font-size:0.9em;">×</button>
            </span>`
          )
          .join('');

        $$('.push-template-chip', wrap).forEach((chip) => {
          chip.addEventListener('click', (e) => {
            if (e.target.classList.contains('push-template-delete')) return;
            const t = list.find((x) => x.id === chip.dataset.id);
            if (!t) return;
            titleInput.value = t.title;
            bodyInput.value = t.body || '';
            urlInput.value = t.url || '';
          });
        });
        $$('.push-template-delete', wrap).forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('이 문구를 삭제할까요?')) return;
            try {
              await api(`/api/admin/push/templates/${btn.dataset.id}`, { method: 'DELETE' });
              loadTemplates();
            } catch (err) {
              alert(err.message);
            }
          });
        });
      } catch (err) {
        wrap.innerHTML = `<p class="hint">불러오지 못했습니다.</p>`;
      }
    }

    $('#push-save-template-btn').addEventListener('click', async () => {
      const title = titleInput.value.trim();
      if (!title) return alert('먼저 알림 제목을 입력해주세요.');
      const name = prompt('이 문구를 어떤 이름으로 저장할까요? (예: 새 설교 알림)');
      if (!name || !name.trim()) return;
      try {
        await api('/api/admin/push/templates', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            title,
            body: bodyInput.value.trim(),
            url: urlInput.value.trim()
          })
        });
        loadTemplates();
      } catch (err) {
        alert(err.message);
      }
    });

    loadTemplates();

    // ---------------- 예약된 알림 ----------------
    async function loadScheduled() {
      const listEl = $('#push-scheduled-list');
      listEl.innerHTML = `<p class="hint">불러오는 중...</p>`;
      try {
        const list = await api('/api/admin/push/scheduled');
        if (!list || list.length === 0) {
          listEl.innerHTML = `<p class="hint">예약된 알림이 없습니다.</p>`;
          return;
        }
        const statusLabel = { pending: '⏳ 대기중', sent: '✅ 발송완료', failed: '❌ 발송실패' };
        listEl.innerHTML = list
          .map((s) => {
            const time = new Date(s.sendAt).toLocaleString('ko-KR');
            const cancelBtn =
              s.status === 'pending'
                ? `<button type="button" class="btn-secondary push-schedule-cancel-btn" data-id="${s.id}">취소</button>`
                : '';
            return `
              <div class="post-row" style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px;">
                <div>
                  <strong>${escapeHtml(s.title)}</strong>
                  <span class="hint" style="margin-left:8px;">${time}</span>
                  <span class="hint" style="margin-left:8px;">${statusLabel[s.status] || s.status}</span>
                </div>
                ${cancelBtn}
              </div>`;
          })
          .join('');
        $$('.push-schedule-cancel-btn', listEl).forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm('이 예약 알림을 취소할까요?')) return;
            try {
              await api(`/api/admin/push/scheduled/${btn.dataset.id}`, { method: 'DELETE' });
              loadScheduled();
            } catch (err) {
              alert(err.message);
            }
          });
        });
      } catch (err) {
        listEl.innerHTML = `<p class="hint">불러오지 못했습니다: ${escapeHtml(err.message)}</p>`;
      }
    }

    $('#push-scheduled-refresh-btn').addEventListener('click', loadScheduled);
    loadScheduled();
  }

  // 큐티·말씀 퀴즈 등록 폼의 "알림 예약하기" 체크박스 공통 처리.
  // 체크하면 시간 선택칸을 보여주고 기본값을 1시간 뒤로 채워둡니다.
  function setupSchedulePushToggle(checkboxId, fieldId, timeInputId) {
    const checkbox = $('#' + checkboxId);
    const field = $('#' + fieldId);
    const timeInput = $('#' + timeInputId);
    if (!checkbox) return;
    checkbox.addEventListener('change', () => {
      field.style.display = checkbox.checked ? '' : 'none';
      if (checkbox.checked && !timeInput.value) {
        const d = new Date(Date.now() + 60 * 60 * 1000); // 기본값: 1시간 뒤
        d.setSeconds(0, 0);
        const tzOffset = d.getTimezoneOffset() * 60000;
        timeInput.value = new Date(d - tzOffset).toISOString().slice(0, 16);
      }
    });
  }

  // 큐티/퀴즈 등록 성공 후, 체크되어 있으면 예약 알림을 같이 만듭니다.
  async function maybeScheduleLinkedPush({ checkboxId, timeInputId, linkedType, linkedId, title, url }) {
    const checkbox = $('#' + checkboxId);
    if (!checkbox || !checkbox.checked) return;
    const timeInput = $('#' + timeInputId);
    if (!timeInput.value) return;
    try {
      await api('/api/admin/push/scheduled', {
        method: 'POST',
        body: JSON.stringify({
          title,
          body: '',
          url: url || '/',
          sendAt: new Date(timeInput.value).toISOString(),
          linkedType,
          linkedId
        })
      });
    } catch (err) {
      alert('알림 예약에 실패했습니다: ' + err.message);
    }
    checkbox.checked = false;
    timeInput.value = '';
    $('#' + checkboxId.replace('-check', '-time-field')).style.display = 'none';
  }

  function initDashboard() {
    if (dashboardInitialized) return;
    dashboardInitialized = true;
    postEditor = new Quill('#p-content-editor', {
      theme: 'snow',
      modules: { toolbar: '#p-content-toolbar' },
      placeholder: '내용을 입력하세요. Enter로 줄바꿈, 위 도구모음으로 글자 크기·굵기·색상을 바꿀 수 있습니다.'
    });
    setupNav();
    const initialActiveNav = $('.nav-item.active');
    const toggleCurrentLabelInit = $('#sidebar-toggle-current');
    if (initialActiveNav && toggleCurrentLabelInit) {
      toggleCurrentLabelInit.textContent = initialActiveNav.textContent;
    }
    filterNavByPermission();
    setupFontPickers();
    loadSiteIntoForm();
    loadMenuList();
    loadPostList();
    loadSermonPreview();
    setupImageUploadFields();
    setupSermonPhotoUpload();
    setupHeroImageUpload();
    setupSiteSave();
    setupServiceTimeEditor();
    setupMenuEditor();
    setupPostEditor();
    setupSermonRefresh();
    setupAccountPanel();
    setupQtEditor();
    setupQtPasteParser();
    loadQtList();
    setupQtBackgroundEditor();
    setupPraiseEditor();
    loadPraiseList();
    setupMissionEditor();
    loadMissionList();
    setupPartnerEditor();
    loadPartnerList();
    loadStats().catch(() => {}); // 통계 권한이 없는 부관리자는 조용히 건너뜀
    loadReceiptRequests().catch(() => {}); // 영수증 신청 권한이 없는 부관리자는 조용히 건너뜀
    setupPrayersAdminPanel();
    setupInquiriesAdminPanel();
    setupQuizAdminPanel();
    setupPushPanel();
    setupSchedulePushToggle('qt-schedule-push-check', 'qt-schedule-push-time-field', 'qt-schedule-push-time');
    setupSchedulePushToggle('quiz-schedule-push-check', 'quiz-schedule-push-time-field', 'quiz-schedule-push-time');
    $('#p-date').value = new Date().toISOString().slice(0, 10);
    $('#qt-date').value = new Date().toISOString().slice(0, 10);
    $('#qt-pastor').value = localStorage.getItem('qtLastPastor') || '';
  }

  // ---------------- 권한별 메뉴 표시 ----------------
  function filterNavByPermission() {
    const isMain = currentSession && currentSession.role === 'main';
    $$('.nav-item[data-permission]').forEach((btn) => {
      const perm = btn.dataset.permission;
      const allowed = isMain || (currentSession.permissions && currentSession.permissions[perm]);
      btn.hidden = !allowed;
    });
    const activeBtn = $('.nav-item.active');
    if (activeBtn && activeBtn.hidden) {
      const firstVisible = $$('.nav-item').find((b) => !b.hidden);
      if (firstVisible) firstVisible.click();
    }
  }

  // ---------------- 이미지 업로드 필드 공통 처리 ----------------
  function setupImageUploadFields() {
    bindImageField('s-aboutImageFile', 's-aboutImagePreview');
    bindImageField('p-imageFile', 'p-imagePreview');
    bindImageField('qt-bg-photoFile', 'qt-bg-photoPreview');
    bindImageField('m-imageFile', 'm-imagePreview');
    bindImageField('pt-imageFile', 'pt-imagePreview');
  }
  function bindImageField(inputId, previewId) {
    const input = $('#' + inputId);
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      input.disabled = true; // 업로드 도중 같은 칸에서 또 파일을 고르지 못하게 잠급니다
      const uploadPromise = uploadImage(file)
        .then((url) => {
          input.dataset.uploadedUrl = url;
          $('#' + previewId).src = url;
        })
        .catch((err) => {
          alert(err.message);
        })
        .finally(() => {
          input.disabled = false;
        });
      input._uploadPromise = uploadPromise; // 저장 버튼이 이 업로드가 끝날 때까지 기다릴 수 있도록 보관
    });
  }

  // 저장 버튼을 눌렀을 때, 방금 고른 사진의 업로드가 아직 끝나지 않았다면 끝날 때까지
  // 기다려줍니다. (업로드가 끝나기 전에 저장을 눌러서 사진 없이 저장되는 문제 방지)
  async function waitForPendingUpload(inputId) {
    const input = $('#' + inputId);
    if (input && input._uploadPromise) {
      await input._uploadPromise;
    }
  }

  // ---------------- 설교 카드용 목사님 사진 목록 ----------------
  let sermonCardPhotos = [];

  function renderSermonPhotoList() {
    const wrap = $('#s-sermonPhotoList');
    if (sermonCardPhotos.length === 0) {
      wrap.innerHTML = '<p class="hint" style="margin:0;">기본 사진 3장만 사용됩니다. 추가로 올리시면 여기에 표시됩니다.</p>';
      return;
    }
    wrap.innerHTML = sermonCardPhotos
      .map(
        (url, i) => `
        <div style="position:relative;" data-idx="${i}">
          <img src="${url}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid #ddd;" />
          <button type="button" class="remove-sermon-photo" data-idx="${i}"
            style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#c0392b;color:#fff;border:none;font-size:12px;cursor:pointer;">×</button>
        </div>`
      )
      .join('');
    $$('.remove-sermon-photo', wrap).forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        sermonCardPhotos.splice(idx, 1);
        renderSermonPhotoList();
      });
    });
  }

  // 히어로 사진·설교 카드 사진처럼 "여러 장 추가" 방식은 배열에 바로 담기 때문에,
  // 저장 버튼이 눌릴 때 이 배열들에 대한 업로드가 아직 진행 중이면 끝날 때까지 기다립니다.
  let sitePendingUploads = [];
  async function waitForSiteUploads() {
    await Promise.all(sitePendingUploads);
    sitePendingUploads = [];
  }

  function setupSermonPhotoUpload() {
    $('#s-sermonPhotoFile').addEventListener('change', () => {
      const input = $('#s-sermonPhotoFile');
      const file = input.files[0];
      if (!file) return;
      const p = uploadImage(file)
        .then((url) => {
          sermonCardPhotos.push(url);
          renderSermonPhotoList();
          input.value = '';
        })
        .catch((err) => alert(err.message));
      sitePendingUploads.push(p);
    });
  }

  // ---------------- 대문(히어로) 배경 사진 목록 ----------------
  let heroBackgroundImages = [];

  function renderHeroImageList() {
    const wrap = $('#s-heroImageList');
    if (heroBackgroundImages.length === 0) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = heroBackgroundImages
      .map(
        (url, i) => `
        <div style="position:relative;" data-idx="${i}">
          <img src="${url}" style="width:96px;height:64px;object-fit:cover;border-radius:6px;border:1px solid #ddd;" />
          <button type="button" class="remove-hero-photo" data-idx="${i}"
            style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#c0392b;color:#fff;border:none;font-size:12px;cursor:pointer;">×</button>
        </div>`
      )
      .join('');
    $$('.remove-hero-photo', wrap).forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        heroBackgroundImages.splice(idx, 1);
        renderHeroImageList();
      });
    });
  }

  function setupHeroImageUpload() {
    $('#s-heroImageFile').addEventListener('change', () => {
      const input = $('#s-heroImageFile');
      const file = input.files[0];
      if (!file) return;
      const p = uploadImage(file)
        .then((url) => {
          heroBackgroundImages.push(url);
          renderHeroImageList();
          input.value = '';
        })
        .catch((err) => alert(err.message));
      sitePendingUploads.push(p);
    });
  }

  // ---------------- 기본 정보 (사이트) ----------------
  let currentSite = null;

  function populateFontSelect(selectEl) {
    selectEl.innerHTML = window.FONT_CATALOG
      .map((f) => `<option value="${f.id}">${escapeHtml(f.label)}</option>`)
      .join('');
  }

  function updateFontPreview(selectId, previewId) {
    const id = $('#' + selectId).value;
    const family = window.getFontFamily(id, 'inherit');
    $('#' + previewId).style.fontFamily = family;
  }

  function setupFontPickers() {
    populateFontSelect($('#s-headingFont'));
    populateFontSelect($('#s-bodyFont'));
    $('#s-headingFont').addEventListener('change', () => updateFontPreview('s-headingFont', 's-headingFont-preview'));
    $('#s-bodyFont').addEventListener('change', () => updateFontPreview('s-bodyFont', 's-bodyFont-preview'));
  }

  async function loadSiteIntoForm() {
    currentSite = await api('/api/admin/site');
    const s = currentSite;
    $('#s-churchName').value = s.churchName || '';

    $('#s-headingFont').value = s.design?.headingFont || 'noto-serif-kr';
    $('#s-bodyFont').value = s.design?.bodyFont || 'pretendard';
    updateFontPreview('s-headingFont', 's-headingFont-preview');
    updateFontPreview('s-bodyFont', 's-bodyFont-preview');
    $('#s-heroVerse').value = s.hero?.verse || '';
    $('#s-heroVerseRef').value = s.hero?.verseRef || '';
    $('#s-heroSubtitle').value = s.hero?.subtitle || '';
    heroBackgroundImages = Array.isArray(s.hero?.backgroundImages) && s.hero.backgroundImages.length
      ? s.hero.backgroundImages.slice()
      : (s.hero?.backgroundImage ? [s.hero.backgroundImage] : []);
    renderHeroImageList();

    $('#s-sermonsIntro').value = s.sermonsIntro || '';
    sermonCardPhotos = Array.isArray(s.sermonCardPhotos) ? [...s.sermonCardPhotos] : [];
    renderSermonPhotoList();
    $('#s-aboutGreeting').value = s.about?.greeting || '';
    $('#s-aboutBody').value = s.about?.body || '';
    $('#s-aboutHistory').value = s.about?.history || '';
    $('#s-pastorName').value = s.about?.pastorName || '';
    $('#s-pastorMessage').value = s.about?.pastorMessage || '';
    if (s.about?.image) $('#s-aboutImagePreview').src = s.about.image;

    $('#s-address').value = s.contact?.address || '';
    $('#s-addressNote').value = s.contact?.addressNote || '';
    $('#s-phone').value = s.contact?.phone || '';
    $('#s-email').value = s.contact?.email || '';
    $('#s-mapUrl').value = s.contact?.mapEmbedUrl || '';
    $('#s-kakaoMapCode').value = '';
    updateKakaoMapStatus(s.contact?.kakaoMapImageUrl, s.contact?.kakaoMapLinkUrl);

    $('#s-offeringBank').value = s.offering?.bank || '';
    $('#s-offeringAccount').value = s.offering?.account || '';
    $('#s-offeringHolder').value = s.offering?.holder || '';
    $('#s-offeringNote').value = s.offering?.note || '';

    $('#s-snsYoutube').value = s.sns?.youtube || '';
    $('#s-snsInstagram').value = s.sns?.instagram || '';
    $('#s-snsFacebook').value = s.sns?.facebook || '';
    $('#s-snsBand').value = s.sns?.band || '';

    $('#s-missionsTitle').value = s.missions?.title || '';
    $('#s-missionsSubtitle').value = s.missions?.subtitle || '';

    renderServiceTimes(s.serviceTimes || []);

    const qtBg = s.qtBackground || { type: 'preset', preset: 'navy' };
    $('#qt-bg-type').value = qtBg.type || 'preset';
    $('#qt-bg-preset').value = qtBg.preset || 'navy';
    if (qtBg.image) $('#qt-bg-photoPreview').src = qtBg.image;
    toggleQtBgFields();
  }

  function renderServiceTimes(list) {
    const container = $('#service-list');
    container.innerHTML = list
      .map(
        (svc, idx) => `
        <div class="list-row" data-id="${svc.id}">
          <input type="text" class="svc-name" value="${escapeAttr(svc.name)}" placeholder="예배 이름" />
          <textarea class="svc-time" rows="1" placeholder="시간 (Enter로 줄바꿈 가능)">${escapeHtml(svc.time || '')}</textarea>
          <button type="button" class="icon-btn remove-svc">삭제</button>
        </div>`
      )
      .join('');

    $$('.remove-svc').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.target.closest('.list-row').remove();
      });
    });
  }

  $('#add-service-btn').addEventListener('click', () => {
    const container = $('#service-list');
    const row = document.createElement('div');
    row.className = 'list-row';
    row.dataset.id = 'svc_' + Date.now();
    row.innerHTML = `
      <input type="text" class="svc-name" placeholder="예배 이름" />
      <textarea class="svc-time" rows="1" placeholder="시간 (Enter로 줄바꿈 가능)"></textarea>
      <button type="button" class="icon-btn remove-svc">삭제</button>`;
    container.appendChild(row);
    row.querySelector('.remove-svc').addEventListener('click', () => row.remove());
  });

  function escapeAttr(str = '') {
    return String(str).replace(/"/g, '&quot;');
  }

  function setupServiceTimeEditor() {
    // 추가/삭제는 위에서 이벤트 바인딩됨. 저장 시점에 값 취합.
  }

  // ---------------- 카카오맵 (지도 미리보기 이미지 + 링크) ----------------
  // 카카오맵 '공유 > HTML 태그 복사'로 나오는 코드에서 지도 미리보기 이미지 주소와,
  // 클릭했을 때 이동할 카카오맵 링크만 안전하게 뽑아서 저장합니다.
  // (관리자가 붙여넣은 코드를 그대로 저장/실행하지 않는 것이 보안상 더 안전합니다.)
  function parseKakaoMapCode(raw) {
    if (!raw || !raw.trim()) return null;
    const imgMatch = raw.match(/<img[^>]*\ssrc="(https:\/\/staticmap\.kakao\.com\/[^"]+)"/);
    const linkMatch = raw.match(/href="(https:\/\/map\.kakao\.com\/[^"]+)"/);
    if (!imgMatch || !linkMatch) return { error: true };

    return {
      imageUrl: imgMatch[1],
      linkUrl: linkMatch[1]
    };
  }

  function updateKakaoMapStatus(imageUrl, linkUrl) {
    const el = $('#kakao-map-status');
    if (!el) return;
    if (imageUrl && linkUrl) {
      el.textContent = '✅ 카카오맵이 연결되어 있습니다. (새 코드를 붙여넣지 않으면 지금 설정이 유지됩니다)';
      el.style.color = '#2f8f4e';
    } else {
      el.textContent = '카카오맵 미설정 — 아래 코드를 붙여넣으면 적용됩니다. (설정 전까지는 위 구글맵 URL이 사용됩니다)';
      el.style.color = '';
    }
  }

  function collectServiceTimes() {
    return $$('#service-list .list-row').map((row) => ({
      id: row.dataset.id,
      name: row.querySelector('.svc-name').value.trim(),
      time: row.querySelector('.svc-time').value.trim()
    })).filter((s) => s.name && s.time);
  }

  function setupSiteSave() {
    $('#save-site-btn').addEventListener('click', async () => {
      const statusEl = $('#site-save-status');
      statusEl.textContent = '저장 중...';
      await waitForPendingUpload('s-aboutImageFile');
      await waitForSiteUploads();
      const aboutImg = $('#s-aboutImageFile').dataset.uploadedUrl || currentSite.about?.image || '';

      // 카카오맵 코드를 새로 붙여넣었으면 파싱해서 사용, 안 붙여넣었으면 기존 값을 그대로 유지
      const kakaoRaw = $('#s-kakaoMapCode').value;
      const parsedKakao = parseKakaoMapCode(kakaoRaw);
      if (parsedKakao && parsedKakao.error) {
        statusEl.textContent = '카카오맵 코드를 다시 확인해주세요 (지도 이미지 주소를 찾을 수 없습니다).';
        statusEl.style.color = '#b3413a';
        return;
      }
      const kakaoMapImageUrl = parsedKakao ? parsedKakao.imageUrl : currentSite.contact?.kakaoMapImageUrl || '';
      const kakaoMapLinkUrl = parsedKakao ? parsedKakao.linkUrl : currentSite.contact?.kakaoMapLinkUrl || '';

      const payload = {
        churchName: $('#s-churchName').value.trim(),
        sermonsIntro: $('#s-sermonsIntro').value.trim(),
        sermonCardPhotos: sermonCardPhotos,
        design: {
          headingFont: $('#s-headingFont').value,
          bodyFont: $('#s-bodyFont').value
        },
        hero: {
          verse: $('#s-heroVerse').value.trim(),
          verseRef: $('#s-heroVerseRef').value.trim(),
          subtitle: $('#s-heroSubtitle').value.trim(),
          backgroundImages: heroBackgroundImages,
          backgroundImage: heroBackgroundImages[0] || '' // 예전 방식과의 호환을 위해 첫 사진도 같이 저장
        },
        about: {
          greeting: $('#s-aboutGreeting').value.trim(),
          body: $('#s-aboutBody').value.trim(),
          history: $('#s-aboutHistory').value.trim(),
          pastorName: $('#s-pastorName').value.trim(),
          pastorMessage: $('#s-pastorMessage').value.trim(),
          image: aboutImg
        },
        serviceTimes: collectServiceTimes(),
        contact: {
          address: $('#s-address').value.trim(),
          addressNote: $('#s-addressNote').value.trim(),
          phone: $('#s-phone').value.trim(),
          email: $('#s-email').value.trim(),
          mapEmbedUrl: $('#s-mapUrl').value.trim(),
          kakaoMapImageUrl,
          kakaoMapLinkUrl
        },
        offering: {
          bank: $('#s-offeringBank').value.trim(),
          account: $('#s-offeringAccount').value.trim(),
          holder: $('#s-offeringHolder').value.trim(),
          note: $('#s-offeringNote').value.trim()
        },
        sns: {
          youtube: $('#s-snsYoutube').value.trim(),
          instagram: $('#s-snsInstagram').value.trim(),
          facebook: $('#s-snsFacebook').value.trim(),
          band: $('#s-snsBand').value.trim()
        },
        missions: {
          title: $('#s-missionsTitle').value.trim(),
          subtitle: $('#s-missionsSubtitle').value.trim()
        }
      };

      try {
        currentSite = await api('/api/admin/site', { method: 'PUT', body: JSON.stringify(payload) });
        statusEl.textContent = '저장되었습니다 ✓';
        $('#s-kakaoMapCode').value = '';
        updateKakaoMapStatus(currentSite.contact?.kakaoMapImageUrl, currentSite.contact?.kakaoMapLinkUrl);
        setTimeout(() => (statusEl.textContent = ''), 3000);
      } catch (err) {
        statusEl.textContent = '';
        alert(err.message);
      }
    });
  }

  // ---------------- 메뉴 관리 ----------------
  async function loadMenuList() {
    const menu = await api('/api/admin/menu');
    renderMenuList(menu.sort((a, b) => a.order - b.order));
  }

  function renderMenuList(menu) {
    const container = $('#menu-list');
    container.innerHTML = menu
      .map(
        (m) => `
        <div class="list-row" data-id="${m.id}">
          <input type="text" class="menu-label" value="${escapeAttr(m.label)}" />
          <input type="text" class="menu-link" value="${escapeAttr(m.link)}" />
          <button type="button" class="icon-btn move up" title="위로">↑</button>
          <button type="button" class="icon-btn move down" title="아래로">↓</button>
          <button type="button" class="icon-btn save-menu" title="저장">저장</button>
          <button type="button" class="icon-btn remove-menu" title="삭제">삭제</button>
        </div>`
      )
      .join('');

    $$('#menu-list .save-menu').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('.list-row');
        const id = row.dataset.id;
        await api(`/api/admin/menu/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            label: row.querySelector('.menu-label').value.trim(),
            link: row.querySelector('.menu-link').value.trim()
          })
        });
        flashSaved(btn);
      })
    );

    $$('#menu-list .remove-menu').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        if (!confirm('이 메뉴를 삭제하시겠습니까?')) return;
        const row = e.target.closest('.list-row');
        await api(`/api/admin/menu/${row.dataset.id}`, { method: 'DELETE' });
        loadMenuList();
      })
    );

    $$('#menu-list .move.up').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        const row = e.target.closest('.list-row');
        const prev = row.previousElementSibling;
        if (prev) container.insertBefore(row, prev);
        saveMenuOrder(container);
      })
    );
    $$('#menu-list .move.down').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        const row = e.target.closest('.list-row');
        const next = row.nextElementSibling;
        if (next) container.insertBefore(next, row);
        saveMenuOrder(container);
      })
    );
  }

  async function saveMenuOrder(container) {
    const order = $$('.list-row', container).map((row) => row.dataset.id);
    await api('/api/admin/menu-reorder', { method: 'PUT', body: JSON.stringify({ order }) });
  }

  function flashSaved(btn) {
    const original = btn.textContent;
    btn.textContent = '완료✓';
    setTimeout(() => (btn.textContent = original), 1500);
  }

  function setupMenuEditor() {
    $('#add-menu-btn').addEventListener('click', async () => {
      const label = $('#new-menu-label').value.trim();
      const link = $('#new-menu-link').value.trim();
      if (!label || !link) return alert('메뉴 이름과 연결 위치를 모두 입력해주세요.');
      await api('/api/admin/menu', { method: 'POST', body: JSON.stringify({ label, link }) });
      $('#new-menu-label').value = '';
      $('#new-menu-link').value = '';
      loadMenuList();
    });
  }

  // ---------------- 게시판 관리 ----------------
  async function loadPostList() {
    const posts = await api('/api/admin/posts');
    renderPostList(posts);
  }

  let currentPosts = [];

  function plainTextFromHtml(html = '') {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || '').replace(/\s+/g, ' ').trim();
  }

  const CATEGORY_LABELS = { 활동: '친교' };
  const categoryLabel = (cat) => CATEGORY_LABELS[cat] || cat;

  function renderPostList(posts) {
    currentPosts = posts;
    const container = $('#post-list');
    if (posts.length === 0) {
      container.innerHTML = `<p class="hint">등록된 게시글이 없습니다.</p>`;
      return;
    }
    container.innerHTML = posts
      .map((p) => {
        const preview = plainTextFromHtml(p.content);
        return `
        <div class="post-row${p.id === editingPostId ? ' editing' : ''}" data-id="${p.id}">
          <span class="badge">${escapeAttr(categoryLabel(p.category))}</span>
          <div>
            <div class="title">${p.pinned ? '📌 ' : ''}${escapeHtml(p.title)}</div>
            <div class="meta">${escapeHtml(preview.slice(0, 60))}${preview.length > 60 ? '…' : ''}</div>
          </div>
          <span class="date">${escapeAttr(p.date)}</span>
          <button type="button" class="icon-btn edit-post">수정</button>
          <button type="button" class="icon-btn remove-post">삭제</button>
        </div>`;
      })
      .join('');

    $$('#post-list .remove-post').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        if (!confirm('이 게시글을 삭제하시겠습니까?')) return;
        const id = e.target.closest('.post-row').dataset.id;
        await api(`/api/admin/posts/${id}`, { method: 'DELETE' });
        if (id === editingPostId) resetPostForm();
        loadPostList();
      })
    );

    $$('#post-list .edit-post').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('.post-row').dataset.id;
        const post = currentPosts.find((p) => p.id === id);
        if (post) loadPostIntoForm(post);
      })
    );
  }

  function escapeHtml(str = '') {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  let editingPostId = null;
  let pendingAttachments = []; // [{name, url}]

  function renderAttachmentEditList() {
    const box = $('#p-attachmentList');
    box.innerHTML = pendingAttachments
      .map(
        (a, idx) => `
        <div class="attachment-edit-item" data-idx="${idx}">
          <span>${escapeHtml(a.name)}</span>
          <button type="button" class="remove-attachment">삭제</button>
        </div>`
      )
      .join('');

    $$('#p-attachmentList .remove-attachment').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        const idx = Number(e.target.closest('.attachment-edit-item').dataset.idx);
        pendingAttachments.splice(idx, 1);
        renderAttachmentEditList();
      })
    );
  }

  function resetPostForm() {
    editingPostId = null;
    pendingAttachments = [];
    $('#post-form-title').textContent = '새 글 작성';
    $('#add-post-btn').textContent = '게시글 등록';
    $('#cancel-edit-btn').hidden = true;
    $('#p-title').value = '';
    postEditor.setContents([]);
    $('#p-pinned').checked = false;
    $('#p-imageFile').value = '';
    $('#p-imageFile').dataset.uploadedUrl = '';
    $('#p-imagePreview').src = '';
    $('#p-attachmentFiles').value = '';
    renderAttachmentEditList();
    $('#p-date').value = new Date().toISOString().slice(0, 10);
    $('#p-category').value = '소식';
  }

  function loadPostIntoForm(post) {
    editingPostId = post.id;
    pendingAttachments = Array.isArray(post.attachments) ? [...post.attachments] : [];
    $('#post-form-title').textContent = '게시글 수정';
    $('#add-post-btn').textContent = '수정 저장';
    $('#cancel-edit-btn').hidden = false;
    $('#p-category').value = post.category || '소식';
    $('#p-date').value = post.date || '';
    $('#p-title').value = post.title || '';
    postEditor.root.innerHTML = post.content || '';
    $('#p-pinned').checked = !!post.pinned;
    $('#p-imageFile').value = '';
    $('#p-imageFile').dataset.uploadedUrl = post.image || '';
    $('#p-imagePreview').src = post.image || '';
    renderAttachmentEditList();
    $('#panel-board').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setupPostEditor() {
    $('#p-attachmentFiles').addEventListener('change', async () => {
      const files = $('#p-attachmentFiles').files;
      if (!files || files.length === 0) return;
      try {
        const uploaded = await uploadAttachments(files);
        pendingAttachments = pendingAttachments.concat(uploaded);
        renderAttachmentEditList();
      } catch (err) {
        alert(err.message);
      } finally {
        $('#p-attachmentFiles').value = '';
      }
    });

    $('#cancel-edit-btn').addEventListener('click', () => {
      resetPostForm();
      loadPostList();
    });

    $('#add-post-btn').addEventListener('click', async () => {
      const title = $('#p-title').value.trim();
      const content = postEditor.root.innerHTML;
      const isEmpty = postEditor.getText().trim().length === 0;
      if (!title || isEmpty) return alert('제목과 내용을 입력해주세요.');
      await waitForPendingUpload('p-imageFile');

      const payload = {
        category: $('#p-category').value,
        date: $('#p-date').value || new Date().toISOString().slice(0, 10),
        title,
        content,
        image: $('#p-imageFile').dataset.uploadedUrl || '',
        attachments: pendingAttachments,
        pinned: $('#p-pinned').checked
      };

      if (editingPostId) {
        await api(`/api/admin/posts/${editingPostId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/api/admin/posts', { method: 'POST', body: JSON.stringify(payload) });
      }

      resetPostForm();
      loadPostList();
    });
  }

  // ---------------- 오늘의 큐티 관리 ----------------
  let currentQtList = [];
  let editingQtId = null;

  async function loadQtList() {
    const list = await api('/api/admin/qt');
    renderQtList(list);
  }

  function renderQtList(list) {
    currentQtList = list;
    const container = $('#qt-list');
    if (!list || list.length === 0) {
      container.innerHTML = `<p class="hint">등록된 큐티가 없습니다.</p>`;
      return;
    }
    container.innerHTML = list
      .map(
        (q) => `
        <div class="post-row${q.id === editingQtId ? ' editing' : ''}" data-id="${q.id}">
          <span class="badge">큐티</span>
          <div>
            <div class="title">${escapeHtml(q.title || '')}</div>
            <div class="meta">${escapeHtml(q.verseRef || '')} · 아멘 ${q.amen || 0}명 참여</div>
          </div>
          <span class="date">${escapeAttr(q.date)}</span>
          <button type="button" class="icon-btn edit-qt">수정</button>
          <button type="button" class="icon-btn remove-qt">삭제</button>
        </div>`
      )
      .join('');

    $$('#qt-list .remove-qt').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        if (!confirm('이 큐티를 삭제하시겠습니까?')) return;
        const id = e.target.closest('.post-row').dataset.id;
        await api(`/api/admin/qt/${id}`, { method: 'DELETE' });
        if (id === editingQtId) resetQtForm();
        loadQtList();
      })
    );

    $$('#qt-list .edit-qt').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('.post-row').dataset.id;
        const item = currentQtList.find((q) => q.id === id);
        if (item) loadQtIntoForm(item);
      })
    );
  }

  function resetQtForm() {
    editingQtId = null;
    $('#qt-form-title').textContent = '새 큐티 작성';
    $('#add-qt-btn').textContent = '큐티 등록';
    $('#cancel-qt-edit-btn').hidden = true;
    $('#qt-date').value = new Date().toISOString().slice(0, 10);
    $('#qt-pastor').value = localStorage.getItem('qtLastPastor') || '';
    $('#qt-title').value = '';
    $('#qt-verseRef').value = '';
    $('#qt-verseText').value = '';
    $('#qt-body').value = '';
    $('#qt-paste').value = '';
    $('#qt-parse-status').textContent = '';
  }

  function loadQtIntoForm(item) {
    editingQtId = item.id;
    $('#qt-form-title').textContent = '큐티 수정';
    $('#add-qt-btn').textContent = '수정 저장';
    $('#cancel-qt-edit-btn').hidden = false;
    $('#qt-date').value = item.date || '';
    $('#qt-pastor').value = item.pastor || '';
    $('#qt-title').value = item.title || '';
    $('#qt-verseRef').value = item.verseRef || '';
    $('#qt-verseText').value = item.verseText || '';
    $('#qt-body').value = item.body || '';
    $('#qt-paste').value = '';
    $('#qt-parse-status').textContent = '';
    $('#panel-qt').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------- 찬양 ----------------
  let currentPraiseList = [];
  let editingPraiseId = null;

  async function loadPraiseList() {
    const list = await api('/api/admin/praises');
    renderPraiseList(list);
  }

  function renderPraiseList(list) {
    currentPraiseList = list;
    const container = $('#praise-list');
    if (!list || list.length === 0) {
      container.innerHTML = `<p class="hint">등록된 찬양이 없습니다.</p>`;
      return;
    }
    container.innerHTML = list
      .map(
        (p) => `
        <div class="post-row${p.id === editingPraiseId ? ' editing' : ''}" data-id="${p.id}">
          <span class="badge">찬양</span>
          <div>
            <div class="title">${escapeHtml(p.title || '')}</div>
            <div class="meta">${escapeHtml(p.singer || '')}</div>
          </div>
          <button type="button" class="icon-btn edit-praise">수정</button>
          <button type="button" class="icon-btn remove-praise">삭제</button>
        </div>`
      )
      .join('');

    $$('#praise-list .remove-praise').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        if (!confirm('이 찬양을 삭제하시겠습니까?')) return;
        const id = e.target.closest('.post-row').dataset.id;
        await api(`/api/admin/praises/${id}`, { method: 'DELETE' });
        if (id === editingPraiseId) resetPraiseForm();
        loadPraiseList();
      })
    );

    $$('#praise-list .edit-praise').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('.post-row').dataset.id;
        const item = currentPraiseList.find((p) => p.id === id);
        if (item) loadPraiseIntoForm(item);
      })
    );
  }

  function resetPraiseForm() {
    editingPraiseId = null;
    $('#praise-form-title').textContent = '새 찬양 등록';
    $('#add-praise-btn').textContent = '찬양 등록';
    $('#cancel-praise-edit-btn').hidden = true;
    $('#praise-title').value = '';
    $('#praise-singer').value = '';
    $('#praise-youtubeUrl').value = '';
  }

  function loadPraiseIntoForm(item) {
    editingPraiseId = item.id;
    $('#praise-form-title').textContent = '찬양 수정';
    $('#add-praise-btn').textContent = '수정 저장';
    $('#cancel-praise-edit-btn').hidden = false;
    $('#praise-title').value = item.title || '';
    $('#praise-singer').value = item.singer || '';
    $('#praise-youtubeUrl').value = item.youtubeId ? `https://www.youtube.com/watch?v=${item.youtubeId}` : '';
    $('#panel-praise').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setupPraiseEditor() {
    $('#cancel-praise-edit-btn').addEventListener('click', () => {
      resetPraiseForm();
      loadPraiseList();
    });

    $('#add-praise-btn').addEventListener('click', async () => {
      const title = $('#praise-title').value.trim();
      const youtubeUrl = $('#praise-youtubeUrl').value.trim();
      if (!title) return alert('제목을 입력해주세요.');
      if (!youtubeUrl) return alert('유튜브 주소를 입력해주세요.');

      const payload = {
        title,
        singer: $('#praise-singer').value.trim(),
        youtubeUrl
      };

      const statusEl = $('#praise-save-status');
      try {
        if (editingPraiseId) {
          await api(`/api/admin/praises/${editingPraiseId}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          await api('/api/admin/praises', { method: 'POST', body: JSON.stringify(payload) });
        }
        statusEl.textContent = '저장 완료 ✓';
        setTimeout(() => (statusEl.textContent = ''), 3000);
        resetPraiseForm();
        loadPraiseList();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  function setupQtEditor() {
    $('#cancel-qt-edit-btn').addEventListener('click', () => {
      resetQtForm();
      loadQtList();
    });

    $('#add-qt-btn').addEventListener('click', async () => {
      const title = $('#qt-title').value.trim();
      if (!title) return alert('제목을 입력해주세요.');

      const payload = {
        date: $('#qt-date').value || new Date().toISOString().slice(0, 10),
        pastor: $('#qt-pastor').value.trim(),
        title,
        verseRef: $('#qt-verseRef').value.trim(),
        verseText: $('#qt-verseText').value.trim(),
        body: $('#qt-body').value.trim()
      };

      const statusEl = $('#qt-save-status');
      try {
        let savedItem;
        if (editingQtId) {
          savedItem = await api(`/api/admin/qt/${editingQtId}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          savedItem = await api('/api/admin/qt', { method: 'POST', body: JSON.stringify(payload) });
        }
        await maybeScheduleLinkedPush({
          checkboxId: 'qt-schedule-push-check',
          timeInputId: 'qt-schedule-push-time',
          linkedType: 'qt',
          linkedId: savedItem.id,
          title: `오늘의 큐티: ${title}`,
          url: '/#qt'
        });
        localStorage.setItem('qtLastPastor', payload.pastor);
        statusEl.textContent = '저장 완료 ✓';
        setTimeout(() => (statusEl.textContent = ''), 3000);
        resetQtForm();
        loadQtList();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // 카톡 붙여넣기 자동 채우기: 빈 줄로 구분된 블록 단위로 나눠 각 입력칸에 배분한다.
  function splitQtPasteBlocks(raw) {
    const normalized = String(raw || '').replace(/\r\n?/g, '\n').trim();
    if (!normalized) return [];
    return normalized
      .split(/\n[ \t]*\n+/)
      .map((block) => block.trim())
      .filter((block) => block.length > 0);
  }

  function normalizeQtVerseRef(raw) {
    const match = raw.match(/^([^\d\n]+?)\s*(\d+)\s*[:：]\s*(\d+)(?:\s*[-~]\s*(\d+))?\s*$/);
    if (!match) return raw;
    const [, book, chapter, v1, v2] = match;
    const verses = v2 ? `${v1}~${v2}` : v1;
    return `${book.trim()} ${chapter}장 ${verses}절`;
  }

  function parseQtPaste(raw) {
    const blocks = splitQtPasteBlocks(raw);
    if (blocks.length < 4) return null;

    const firstLine = blocks[0];
    const verseRef = normalizeQtVerseRef(blocks[1]);
    const verseText = blocks[2];
    const titleRaw = blocks[3];
    const restBlocks = blocks.slice(4);

    const bracketMatch = titleRaw.match(/^[\[【]([\s\S]*?)[\]】]$/);
    const title = bracketMatch ? bracketMatch[1].trim() : titleRaw;

    const body = [firstLine, ...restBlocks].join('\n\n');

    return { title, verseRef, verseText, body };
  }

  function setupQtPasteParser() {
    const btn = $('#qt-parse-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const statusEl = $('#qt-parse-status');
      const parsed = parseQtPaste($('#qt-paste').value);
      if (!parsed) {
        statusEl.textContent = '형식을 인식하지 못했습니다. 직접 입력해주세요.';
        return;
      }
      $('#qt-title').value = parsed.title;
      $('#qt-verseRef').value = parsed.verseRef;
      $('#qt-verseText').value = parsed.verseText;
      $('#qt-body').value = parsed.body;
      statusEl.textContent = '자동으로 채웠습니다. 내용을 확인한 후 저장해주세요.';
    });
  }

  // ---------------- 선교사역 (지도 핀) ----------------
  let currentMissionList = [];
  let editingMissionId = null;

  function populateCountrySelect() {
    const select = $('#m-countryCode');
    select.innerHTML = window.COUNTRY_LIST
      .map((c) => `<option value="${c.code}">${window.isoToFlag(c.code)} ${escapeHtml(c.name)}</option>`)
      .join('');
  }

  async function loadMissionList() {
    currentMissionList = await api('/api/admin/missions');
    renderMissionList(currentMissionList);
  }

  function renderMissionList(list) {
    const container = $('#mission-list');
    if (!list || list.length === 0) {
      container.innerHTML = `<p class="hint">등록된 선교지가 없습니다.</p>`;
      return;
    }
    container.innerHTML = list
      .map(
        (m) => `
        <div class="post-row${m.id === editingMissionId ? ' editing' : ''}" data-id="${m.id}">
          <span class="badge">${window.isoToFlag(m.countryCode)} ${escapeHtml(m.country || '')}</span>
          <div>
            <div class="title">${escapeHtml(m.name || '')}</div>
            <div class="meta">${escapeHtml(m.tag || m.country || '')}</div>
          </div>
          <button type="button" class="icon-btn edit-mission">수정</button>
          <button type="button" class="icon-btn remove-mission">삭제</button>
        </div>`
      )
      .join('');

    $$('#mission-list .remove-mission').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        if (!confirm('이 선교지 정보를 삭제하시겠습니까?')) return;
        const id = e.target.closest('.post-row').dataset.id;
        await api(`/api/admin/missions/${id}`, { method: 'DELETE' });
        if (id === editingMissionId) resetMissionForm();
        loadMissionList();
      })
    );
    $$('#mission-list .edit-mission').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('.post-row').dataset.id;
        const item = currentMissionList.find((m) => m.id === id);
        if (item) loadMissionIntoForm(item);
      })
    );
  }

  function resetMissionForm() {
    editingMissionId = null;
    $('#mission-form-title').textContent = '선교지 추가';
    $('#add-mission-btn').textContent = '선교지 등록';
    $('#cancel-mission-edit-btn').hidden = true;
    $('#m-countryCode').value = 'KR';
    $('#m-tag').value = '';
    $('#m-name').value = '';
    $('#m-desc').value = '';
    $('#m-imageFile').value = '';
    $('#m-imageFile').dataset.uploadedUrl = '';
    $('#m-imagePreview').src = '';
  }

  function loadMissionIntoForm(item) {
    editingMissionId = item.id;
    $('#mission-form-title').textContent = '선교지 수정';
    $('#add-mission-btn').textContent = '수정 저장';
    $('#cancel-mission-edit-btn').hidden = false;
    $('#m-countryCode').value = item.countryCode || 'KR';
    $('#m-tag').value = item.tag || '';
    $('#m-name').value = item.name || '';
    $('#m-desc').value = item.desc || '';
    $('#m-imageFile').dataset.uploadedUrl = item.image || '';
    $('#m-imagePreview').src = item.image || ''; // 사진이 없는 항목이면 이전 항목의 미리보기가 남아있지 않도록 확실히 비웁니다
    $('#panel-missions').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setupMissionEditor() {
    populateCountrySelect();

    $('#cancel-mission-edit-btn').addEventListener('click', () => {
      resetMissionForm();
      loadMissionList();
    });

    $('#add-mission-btn').addEventListener('click', async () => {
      const name = $('#m-name').value.trim();
      if (!name) return alert('선교사님 성함을 입력해주세요.');
      await waitForPendingUpload('m-imageFile');
      const countryCode = $('#m-countryCode').value;
      const country = window.findCountryByCode(countryCode);

      const payload = {
        countryCode,
        country: country ? country.name : '',
        lat: country ? country.lat : 0,
        lon: country ? country.lon : 0,
        name,
        tag: $('#m-tag').value.trim(),
        desc: $('#m-desc').value.trim(),
        image: $('#m-imageFile').dataset.uploadedUrl || ''
      };

      const statusEl = $('#mission-save-status');
      try {
        if (editingMissionId) {
          await api(`/api/admin/missions/${editingMissionId}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          await api('/api/admin/missions', { method: 'POST', body: JSON.stringify(payload) });
        }
        statusEl.textContent = '저장 완료 ✓';
        setTimeout(() => (statusEl.textContent = ''), 3000);
        resetMissionForm();
        loadMissionList();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // ---------------- 동역자의 섬김 ----------------
  let currentPartnerList = [];
  let editingPartnerId = null;

  async function loadPartnerList() {
    currentPartnerList = await api('/api/admin/partners');
    renderPartnerList(currentPartnerList);
  }

  function renderPartnerList(list) {
    const container = $('#partner-list');
    if (!list || list.length === 0) {
      container.innerHTML = `<p class="hint">등록된 동역자가 없습니다.</p>`;
      return;
    }
    container.innerHTML = list
      .map((p) => {
        const days = p.startDate ? Math.floor((Date.now() - new Date(p.startDate).getTime()) / 86400000) + 1 : null;
        return `
        <div class="post-row${p.id === editingPartnerId ? ' editing' : ''}" data-id="${p.id}">
          <span class="badge">${days !== null ? 'D+' + days : '-'}</span>
          <div>
            <div class="title">${escapeHtml(p.name || '')}</div>
            <div class="meta">${escapeHtml(p.note || '')}</div>
          </div>
          <button type="button" class="icon-btn edit-partner">수정</button>
          <button type="button" class="icon-btn remove-partner">삭제</button>
        </div>`;
      })
      .join('');

    $$('#partner-list .remove-partner').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        if (!confirm('이 동역자 정보를 삭제하시겠습니까?')) return;
        const id = e.target.closest('.post-row').dataset.id;
        await api(`/api/admin/partners/${id}`, { method: 'DELETE' });
        if (id === editingPartnerId) resetPartnerForm();
        loadPartnerList();
      })
    );
    $$('#partner-list .edit-partner').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('.post-row').dataset.id;
        const item = currentPartnerList.find((p) => p.id === id);
        if (item) loadPartnerIntoForm(item);
      })
    );
  }

  function resetPartnerForm() {
    editingPartnerId = null;
    $('#partner-form-title').textContent = '동역자 추가';
    $('#add-partner-btn').textContent = '동역자 등록';
    $('#cancel-partner-edit-btn').hidden = true;
    $('#pt-name').value = '';
    $('#pt-startDate').value = '';
    $('#pt-note').value = '';
    $('#pt-imageFile').value = '';
    $('#pt-imageFile').dataset.uploadedUrl = '';
    $('#pt-imagePreview').src = '';
  }

  function loadPartnerIntoForm(item) {
    editingPartnerId = item.id;
    $('#partner-form-title').textContent = '동역자 수정';
    $('#add-partner-btn').textContent = '수정 저장';
    $('#cancel-partner-edit-btn').hidden = false;
    $('#pt-name').value = item.name || '';
    $('#pt-startDate').value = item.startDate || '';
    $('#pt-note').value = item.note || '';
    $('#pt-imageFile').dataset.uploadedUrl = item.image || '';
    $('#pt-imagePreview').src = item.image || ''; // 사진이 없는 항목이면 이전 항목의 미리보기가 남아있지 않도록 확실히 비웁니다
    $('#panel-missions').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setupPartnerEditor() {
    $('#cancel-partner-edit-btn').addEventListener('click', () => {
      resetPartnerForm();
      loadPartnerList();
    });

    $('#add-partner-btn').addEventListener('click', async () => {
      const name = $('#pt-name').value.trim();
      if (!name) return alert('이름 또는 기관명을 입력해주세요.');
      await waitForPendingUpload('pt-imageFile');

      const payload = {
        name,
        startDate: $('#pt-startDate').value || '',
        note: $('#pt-note').value.trim(),
        image: $('#pt-imageFile').dataset.uploadedUrl || ''
      };

      const statusEl = $('#partner-save-status');
      try {
        if (editingPartnerId) {
          await api(`/api/admin/partners/${editingPartnerId}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          await api('/api/admin/partners', { method: 'POST', body: JSON.stringify(payload) });
        }
        statusEl.textContent = '저장 완료 ✓';
        setTimeout(() => (statusEl.textContent = ''), 3000);
        resetPartnerForm();
        loadPartnerList();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // ---------------- 큐티 배경 디자인 ----------------
  function toggleQtBgFields() {
    const type = $('#qt-bg-type').value;
    $('#qt-bg-preset-field').hidden = type !== 'preset';
    $('#qt-bg-photo-field').hidden = type !== 'photo';
  }

  function setupQtBackgroundEditor() {
    $('#qt-bg-type').addEventListener('change', toggleQtBgFields);

    $('#save-qt-bg-btn').addEventListener('click', async () => {
      await waitForPendingUpload('qt-bg-photoFile');
      const payload = {
        type: $('#qt-bg-type').value,
        preset: $('#qt-bg-preset').value,
        image: $('#qt-bg-photoFile').dataset.uploadedUrl || $('#qt-bg-photoPreview').getAttribute('src') || ''
      };
      const statusEl = $('#qt-bg-save-status');
      try {
        await api('/api/admin/qt-background', { method: 'PUT', body: JSON.stringify(payload) });
        statusEl.textContent = '저장 완료 ✓';
        setTimeout(() => (statusEl.textContent = ''), 3000);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // ---------------- 통계 ----------------
  function sumStatsByDay(byDay, days) {
    const today = new Date();
    let total = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = byDay[key] || {};
      total += Object.values(dayData).reduce((a, b) => a + b, 0);
    }
    return total;
  }

  function aggregateByLabel(byDay, days) {
    const today = new Date();
    const totals = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = byDay[key] || {};
      Object.entries(dayData).forEach(([label, count]) => {
        totals[label] = (totals[label] || 0) + count;
      });
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }

  const CLICK_LABELS = {
    sermon_card: '설교 영상',
    board_card: '소식·활동 게시글',
    qt_card: '오늘의 큐티 카드',
    qt_archive_row: '지난 큐티 목록',
    amen_button: "'아멘' 누르기",
    share_button: '큐티 공유'
  };

  function renderBarList(container, entries, labelMap = {}) {
    if (entries.length === 0) {
      container.innerHTML = `<p class="hint">아직 데이터가 없습니다.</p>`;
      return;
    }
    const max = entries[0][1] || 1;
    container.innerHTML = entries
      .slice(0, 10)
      .map(([key, count]) => {
        const label = labelMap[key] || key;
        const pct = Math.max(6, Math.round((count / max) * 100));
        return `
        <div class="stats-bar-row">
          <span class="stats-bar-label">${escapeHtml(label)}</span>
          <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${pct}%"></div></div>
          <span class="stats-bar-count">${count}</span>
        </div>`;
      })
      .join('');
  }

  async function loadStats() {
    const [stats, qtList] = await Promise.all([api('/api/admin/stats'), api('/api/admin/qt')]);
    const qtTitleById = {};
    qtList.forEach((q) => (qtTitleById['/qt/' + q.id] = q.title));
    const pageLabelMap = { '/': '홈페이지', ...qtTitleById };

    const today = sumStatsByDay(stats.pageviews, 1);
    const last7 = sumStatsByDay(stats.pageviews, 7);
    const last30 = sumStatsByDay(stats.pageviews, 30);

    $('#stats-summary-cards').innerHTML = `
      <div class="stat-card"><div class="num">${today}</div><div class="label">오늘</div></div>
      <div class="stat-card"><div class="num">${last7}</div><div class="label">최근 7일</div></div>
      <div class="stat-card"><div class="num">${last30}</div><div class="label">최근 30일</div></div>`;

    renderBarList($('#stats-click-list'), aggregateByLabel(stats.clicks, 7), CLICK_LABELS);
    renderBarList($('#stats-page-list'), aggregateByLabel(stats.pageviews, 7), pageLabelMap);
  }

  // ---------------- 기부금 영수증 신청 관리 ----------------
  function formatReceiptDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  }

  async function loadReceiptRequests() {
    const list = await api('/api/admin/receipt-requests');
    renderReceiptList(list);
  }

  function renderReceiptList(list) {
    const container = $('#receipt-list');
    if (!list || list.length === 0) {
      container.innerHTML = `<p class="hint">접수된 신청이 없습니다.</p>`;
      return;
    }
    container.innerHTML = list
      .map(
        (r) => `
        <div class="post-row" data-id="${r.id}">
          <span class="badge">신청</span>
          <div>
            <div class="title">${escapeHtml(r.name)} · ${escapeHtml(r.phone)}${r.email ? ' · ' + escapeHtml(r.email) : ''}</div>
            <div class="meta">${escapeHtml(r.note || '')}</div>
          </div>
          <span class="date">${formatReceiptDate(r.createdAt)}</span>
          <button type="button" class="icon-btn remove-receipt">처리완료(삭제)</button>
        </div>`
      )
      .join('');

    $$('#receipt-list .remove-receipt').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        if (!confirm('처리 완료 처리하고 목록에서 삭제하시겠습니까?')) return;
        const id = e.target.closest('.post-row').dataset.id;
        await api(`/api/admin/receipt-requests/${id}`, { method: 'DELETE' });
        loadReceiptRequests();
      })
    );
  }

  // ---------------- 설교 영상 (유튜브) ----------------
  async function loadSermonPreview() {
    const data = await api('/api/admin/sermons');
    renderSermonPreview(data);
  }

  function renderSermonPreview(data) {
    $('#sermon-last-updated').textContent = data.lastUpdated
      ? `마지막 업데이트: ${new Date(data.lastUpdated).toLocaleString('ko-KR')}`
      : '아직 업데이트된 적이 없습니다.';

    const container = $('#sermon-preview-list');
    if (!data.videos || data.videos.length === 0) {
      container.innerHTML = `<p class="hint">캐시된 영상이 없습니다. 새로고침을 눌러주세요.</p>`;
      return;
    }
    container.innerHTML = data.videos
      .map(
        (v) => `
        <div class="sermon-preview-item">
          <img src="${v.thumbnail}" alt="${escapeAttr(v.title)}" />
          <div class="t">${escapeHtml(v.title)}</div>
        </div>`
      )
      .join('');
  }

  function setupSermonRefresh() {
    $('#refresh-sermons-btn').addEventListener('click', async () => {
      const statusEl = $('#sermon-refresh-status');
      const channelId = $('#yt-channelId').value.trim();
      statusEl.textContent = '새로고침 중...';
      try {
        const data = await api('/api/admin/sermons/refresh', {
          method: 'POST',
          body: JSON.stringify(channelId ? { channelId } : {})
        });
        renderSermonPreview(data);
        statusEl.textContent = `완료 ✓ (영상 ${data.videos.length}개 갱신)`;
        setTimeout(() => (statusEl.textContent = ''), 4000);
      } catch (err) {
        statusEl.textContent = '';
        alert(err.message);
      }
    });

    $('#clear-sermon-posters-btn').addEventListener('click', async () => {
      if (!confirm('저장된 설교 카드 이미지를 전부 지우고 다시 만들까요?')) return;
      const statusEl = $('#sermon-posters-clear-status');
      statusEl.textContent = '처리 중...';
      try {
        await api('/api/admin/sermon-posters', { method: 'DELETE' });
        statusEl.textContent = '완료 ✓ (홈페이지를 새로고침하면 다시 만들어집니다)';
        setTimeout(() => (statusEl.textContent = ''), 5000);
      } catch (err) {
        statusEl.textContent = '';
        alert(err.message);
      }
    });
  }

  // ---------------- 계정 관리 ----------------
  function setupAccountPanel() {
    setupMyPasswordForm();
    if (currentSession && currentSession.role === 'main') {
      $('#account-add-card').hidden = false;
      $('#account-list-card').hidden = false;
      setupAddAccountForm();
      loadAccountList();
    }
  }

  function setupMyPasswordForm() {
    $('#save-password-btn').addEventListener('click', async () => {
      const currentPassword = $('#pw-current').value;
      const newPassword = $('#pw-new').value;
      const confirmPassword = $('#pw-confirm').value;
      if (newPassword.length < 6) return alert('새 비밀번호는 6자 이상이어야 합니다.');
      if (newPassword !== confirmPassword) return alert('새 비밀번호가 서로 일치하지 않습니다.');

      const statusEl = $('#password-save-status');
      try {
        await api('/api/admin/my-password', {
          method: 'PUT',
          body: JSON.stringify({ currentPassword, newPassword })
        });
        $('#pw-current').value = '';
        $('#pw-new').value = '';
        $('#pw-confirm').value = '';
        statusEl.textContent = '변경 완료 ✓';
        setTimeout(() => (statusEl.textContent = ''), 3000);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  function setupAddAccountForm() {
    $('#add-account-btn').addEventListener('click', async () => {
      const username = $('#acc-username').value.trim();
      const password = $('#acc-password').value;
      if (!username || password.length < 6) {
        return alert('아이디와 6자 이상의 비밀번호를 입력해주세요.');
      }
      const permissions = {
        site: $('#acc-perm-site').checked,
        menu: $('#acc-perm-menu').checked,
        posts: $('#acc-perm-posts').checked,
        sermons: $('#acc-perm-sermons').checked,
        qt: $('#acc-perm-qt').checked,
        missions: $('#acc-perm-missions').checked,
        stats: $('#acc-perm-stats').checked,
        receipts: $('#acc-perm-receipts').checked
      };
      const statusEl = $('#account-add-status');
      try {
        await api('/api/admin/accounts', {
          method: 'POST',
          body: JSON.stringify({ username, password, permissions })
        });
        $('#acc-username').value = '';
        $('#acc-password').value = '';
        ['site', 'menu', 'posts', 'sermons', 'qt', 'missions', 'stats', 'receipts'].forEach((p) => ($('#acc-perm-' + p).checked = false));
        statusEl.textContent = '추가 완료 ✓';
        setTimeout(() => (statusEl.textContent = ''), 3000);
        loadAccountList();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  async function loadAccountList() {
    const accounts = await api('/api/admin/accounts');
    renderAccountList(accounts);
  }

  function renderAccountList(accounts) {
    const container = $('#account-list');
    container.innerHTML = accounts
      .map((a) => {
        const isMain = a.role === 'main';
        const perms = a.permissions || {};
        const permRow = ['site', 'menu', 'posts', 'sermons', 'qt', 'missions', 'stats', 'receipts']
          .map(
            (p) => `
            <label>
              <input type="checkbox" class="perm-${p}" ${perms[p] ? 'checked' : ''} ${isMain ? 'disabled' : ''} />
              ${{ site: '기본 정보', menu: '메뉴 관리', posts: '소식·활동 게시판', sermons: '설교 영상', qt: '오늘의 큐티', missions: '선교사역', stats: '통계', receipts: '영수증 신청' }[p]}
            </label>`
          )
          .join('');

        return `
        <div class="account-row" data-id="${a.id}">
          <div class="account-row-top">
            <span class="badge${isMain ? ' main' : ''}">${isMain ? '메인 관리자' : '부관리자'}</span>
            <span class="account-username">${escapeHtml(a.username)}</span>
            ${!isMain ? `<button type="button" class="icon-btn remove-account">계정 삭제</button>` : ''}
          </div>
          <div class="permission-checks">${permRow}</div>
          ${
            !isMain
              ? `<div class="account-pw-row">
                  <input type="password" class="acc-new-pw" placeholder="새 비밀번호 (변경할 때만 입력, 6자 이상)" />
                  <button type="button" class="btn-secondary save-account-btn">저장</button>
                </div>`
              : ''
          }
        </div>`;
      })
      .join('');

    $$('#account-list .save-account-btn').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('.account-row');
        const id = row.dataset.id;
        const permissions = {
          site: row.querySelector('.perm-site').checked,
          menu: row.querySelector('.perm-menu').checked,
          posts: row.querySelector('.perm-posts').checked,
          sermons: row.querySelector('.perm-sermons').checked,
          qt: row.querySelector('.perm-qt').checked,
          missions: row.querySelector('.perm-missions').checked,
          stats: row.querySelector('.perm-stats').checked,
          receipts: row.querySelector('.perm-receipts').checked
        };
        const newPassword = row.querySelector('.acc-new-pw').value;
        if (newPassword && newPassword.length < 6) {
          return alert('새 비밀번호는 6자 이상이어야 합니다.');
        }
        const payload = { permissions };
        if (newPassword) payload.newPassword = newPassword;
        try {
          await api(`/api/admin/accounts/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
          flashSaved(btn);
          row.querySelector('.acc-new-pw').value = '';
        } catch (err) {
          alert(err.message);
        }
      })
    );

    $$('#account-list .remove-account').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('.account-row');
        const id = row.dataset.id;
        const username = row.querySelector('.account-username').textContent;
        if (!confirm(`'${username}' 계정을 삭제하시겠습니까?`)) return;
        await api(`/api/admin/accounts/${id}`, { method: 'DELETE' });
        loadAccountList();
      })
    );
  }

  // ---------------- 시작 ----------------
  checkSession();
})();
