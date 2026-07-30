(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

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
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
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
      const { isAdmin } = await api('/api/admin/session');
      if (isAdmin) showDashboard();
      else showLogin();
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
    $('#p-date').value = new Date().toISOString().slice(0, 10);
  }

  // ---------------- 이미지 업로드 필드 공통 처리 ----------------
  function setupImageUploadFields() {
    bindImageField('s-heroImageFile', 's-heroImagePreview');
    bindImageField('s-aboutImageFile', 's-aboutImagePreview');
    bindImageField('p-imageFile', 'p-imagePreview');
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

  async function loadSiteIntoForm() {
    currentSite = await api('/api/admin/site');
    const s = currentSite;
    $('#s-churchName').value = s.churchName || '';
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
    $('#s-phone').value = s.contact?.phone || '';
    $('#s-email').value = s.contact?.email || '';
    $('#s-mapUrl').value = s.contact?.mapEmbedUrl || '';

    $('#s-snsYoutube').value = s.sns?.youtube || '';
    $('#s-snsInstagram').value = s.sns?.instagram || '';
    $('#s-snsFacebook').value = s.sns?.facebook || '';

    renderServiceTimes(s.serviceTimes || []);
  }

  function renderServiceTimes(list) {
    const container = $('#service-list');
    container.innerHTML = list
      .map(
        (svc, idx) => `
        <div class="list-row" data-id="${svc.id}">
          <input type="text" class="svc-name" value="${escapeAttr(svc.name)}" placeholder="예배 이름" />
          <input type="text" class="svc-time" value="${escapeAttr(svc.time)}" placeholder="시간" />
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
      <input type="text" class="svc-time" placeholder="시간" />
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
          phone: $('#s-phone').value.trim(),
          email: $('#s-email').value.trim(),
          mapEmbedUrl: $('#s-mapUrl').value.trim()
        },
        sns: {
          youtube: $('#s-snsYoutube').value.trim(),
          instagram: $('#s-snsInstagram').value.trim(),
          facebook: $('#s-snsFacebook').value.trim()
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

  // ---------------- 시작 ----------------
  checkSession();
})();
