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
    $$('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.nav-item').forEach((b) => b.classList.remove('active'));
        $$('.panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        $('#' + btn.dataset.panel).classList.add('active');
      });
    });
  }

  let postEditor = null;

  function initDashboard() {
    if (dashboardInitialized) return;
    dashboardInitialized = true;
    postEditor = new Quill('#p-content-editor', {
      theme: 'snow',
      modules: { toolbar: '#p-content-toolbar' },
      placeholder: '내용을 입력하세요. Enter로 줄바꿈, 위 도구모음으로 글자 크기·굵기·색상을 바꿀 수 있습니다.'
    });
    setupNav();
    filterNavByPermission();
    setupFontPickers();
    loadSiteIntoForm();
    loadMenuList();
    loadPostList();
    loadSermonPreview();
    setupImageUploadFields();
    setupSiteSave();
    setupServiceTimeEditor();
    setupMenuEditor();
    setupPostEditor();
    setupSermonRefresh();
    setupAccountPanel();
    setupQtEditor();
    loadQtList();
    setupQtBackgroundEditor();
    setupMissionEditor();
    loadMissionList();
    setupPartnerEditor();
    loadPartnerList();
    loadStats().catch(() => {}); // 통계 권한이 없는 부관리자는 조용히 건너뜀
    loadReceiptRequests().catch(() => {}); // 영수증 신청 권한이 없는 부관리자는 조용히 건너뜀
    $('#p-date').value = new Date().toISOString().slice(0, 10);
    $('#qt-date').value = new Date().toISOString().slice(0, 10);
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
    bindImageField('s-heroImageFile', 's-heroImagePreview');
    bindImageField('s-aboutImageFile', 's-aboutImagePreview');
    bindImageField('p-imageFile', 'p-imagePreview');
    bindImageField('qt-bg-photoFile', 'qt-bg-photoPreview');
    bindImageField('m-imageFile', 'm-imagePreview');
    bindImageField('pt-imageFile', 'pt-imagePreview');
  }
  function bindImageField(inputId, previewId) {
    const input = $('#' + inputId);
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const url = await uploadImage(file);
        input.dataset.uploadedUrl = url;
        $('#' + previewId).src = url;
      } catch (err) {
        alert(err.message);
      }
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
    if (s.hero?.backgroundImage) $('#s-heroImagePreview').src = s.hero.backgroundImage;

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

    $('#s-offeringBank').value = s.offering?.bank || '';
    $('#s-offeringAccount').value = s.offering?.account || '';
    $('#s-offeringHolder').value = s.offering?.holder || '';
    $('#s-offeringNote').value = s.offering?.note || '';

    $('#s-snsYoutube').value = s.sns?.youtube || '';
    $('#s-snsInstagram').value = s.sns?.instagram || '';
    $('#s-snsFacebook').value = s.sns?.facebook || '';

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
      const heroImg = $('#s-heroImageFile').dataset.uploadedUrl || currentSite.hero?.backgroundImage || '';
      const aboutImg = $('#s-aboutImageFile').dataset.uploadedUrl || currentSite.about?.image || '';

      const payload = {
        churchName: $('#s-churchName').value.trim(),
        design: {
          headingFont: $('#s-headingFont').value,
          bodyFont: $('#s-bodyFont').value
        },
        hero: {
          verse: $('#s-heroVerse').value.trim(),
          verseRef: $('#s-heroVerseRef').value.trim(),
          subtitle: $('#s-heroSubtitle').value.trim(),
          backgroundImage: heroImg
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
          mapEmbedUrl: $('#s-mapUrl').value.trim()
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
          facebook: $('#s-snsFacebook').value.trim()
        },
        missions: {
          title: $('#s-missionsTitle').value.trim(),
          subtitle: $('#s-missionsSubtitle').value.trim()
        }
      };

      try {
        currentSite = await api('/api/admin/site', { method: 'PUT', body: JSON.stringify(payload) });
        statusEl.textContent = '저장되었습니다 ✓';
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
          <span class="badge">${escapeAttr(p.category)}</span>
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
    $('#qt-pastor').value = '';
    $('#qt-title').value = '';
    $('#qt-verseRef').value = '';
    $('#qt-verseText').value = '';
    $('#qt-body').value = '';
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
    $('#panel-qt').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        if (editingQtId) {
          await api(`/api/admin/qt/${editingQtId}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          await api('/api/admin/qt', { method: 'POST', body: JSON.stringify(payload) });
        }
        statusEl.textContent = '저장 완료 ✓';
        setTimeout(() => (statusEl.textContent = ''), 3000);
        resetQtForm();
        loadQtList();
      } catch (err) {
        alert(err.message);
      }
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
    if (item.image) $('#m-imagePreview').src = item.image;
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
    if (item.image) $('#pt-imagePreview').src = item.image;
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
