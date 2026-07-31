(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`요청 실패: ${url}`);
    return res.json();
  }

  function escapeHtml(str = '') {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ---------------- 헤더 스크롤 효과 ----------------
  const header = $('#site-header');
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 40);
  });

  // ---------------- 모바일 메뉴 ----------------
  const hamburger = $('#hamburger');
  const navMobile = $('#nav-mobile');
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMobile.classList.toggle('open');
  });
  navMobile.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      hamburger.classList.remove('active');
      navMobile.classList.remove('open');
    }
  });

  // ---------------- 사이트 기본 정보 ----------------
  async function loadSite() {
    const site = await getJSON('/api/site');

    if (site.design) {
      const headingFamily = window.getFontFamily(site.design.headingFont, "'Noto Serif KR', serif");
      const bodyFamily = window.getFontFamily(site.design.bodyFont, "'Pretendard', 'Noto Sans KR', sans-serif");
      document.documentElement.style.setProperty('--font-heading', headingFamily);
      document.documentElement.style.setProperty('--font-body', bodyFamily);
    }

    document.title = site.churchName || '교회 홈페이지';
    $('#brand-name').innerHTML = `${escapeHtml(site.churchName || '교회')}<span class="gold-dot">.</span>`;
    $('#footer-brand').textContent = site.churchName || '';
    $('#footer-brand-2').textContent = site.churchName || '';
    $('#footer-year').textContent = new Date().getFullYear();

    if (site.hero) {
      $('#hero-verse').textContent = site.hero.verse || '';
      $('#hero-verse-ref').textContent = site.hero.verseRef || '';
      $('#hero-subtitle').textContent = site.hero.subtitle || '';
      if (site.hero.backgroundImage) {
        $('.hero').style.background =
          `linear-gradient(180deg, rgba(13,21,38,0.72), rgba(13,21,38,0.86)), url('${site.hero.backgroundImage}') center/cover no-repeat`;
      }
    }

    if (site.about) {
      $('#about-greeting').textContent = site.about.greeting || site.about.title || '교회 소개';
      $('#about-body-text').textContent = site.about.body || '';
      $('#about-history').textContent = site.about.history || '';
      $('#pastor-name').textContent = site.about.pastorName || '';
      $('#pastor-message').textContent = site.about.pastorMessage || '';
      if (site.about.image) $('#about-image').src = site.about.image;
    }

    const serviceGrid = $('#service-grid');
    serviceGrid.innerHTML = (site.serviceTimes || [])
      .map(
        (s) => `
        <div class="service-card">
          <div class="name">${escapeHtml(s.name)}</div>
          <div class="time">${escapeHtml(s.time)}</div>
        </div>`
      )
      .join('');

    if (site.contact) {
      $('#contact-address').textContent = site.contact.address || '';
      $('#contact-phone').textContent = site.contact.phone || '';
      $('#contact-email').textContent = site.contact.email || '';
      if (site.contact.mapEmbedUrl) {
        $('#map-box').innerHTML = `<iframe src="${site.contact.mapEmbedUrl}" loading="lazy" allowfullscreen></iframe>`;
      }
    }

    const footerSns = $('#footer-sns');
    const links = [];
    if (site.sns) {
      if (site.sns.youtube) links.push(`<a href="${site.sns.youtube}" target="_blank" rel="noopener">유튜브</a>`);
      if (site.sns.instagram) links.push(`<a href="${site.sns.instagram}" target="_blank" rel="noopener">인스타그램</a>`);
      if (site.sns.facebook) links.push(`<a href="${site.sns.facebook}" target="_blank" rel="noopener">페이스북</a>`);
    }
    footerSns.innerHTML = links.join('');
  }

  // ---------------- 메뉴 ----------------
  async function loadMenu() {
    const menu = await getJSON('/api/menu');
    const html = menu.map((m) => `<a href="${escapeHtml(m.link)}">${escapeHtml(m.label)}</a>`).join('');
    $('#nav-desktop').innerHTML = html;
    $('#nav-mobile').innerHTML = html;
  }

  // ---------------- 설교 영상 ----------------
  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  function openVideoModal(videoId) {
    const modal = $('#video-modal');
    $('#video-modal-frame').innerHTML =
      `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" title="설교 영상" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    modal.classList.add('open');
  }
  function closeVideoModal() {
    $('#video-modal').classList.remove('open');
    $('#video-modal-frame').innerHTML = '';
  }
  $('#video-modal-close').addEventListener('click', closeVideoModal);
  $('#video-modal').addEventListener('click', (e) => {
    if (e.target.id === 'video-modal') closeVideoModal();
  });

  async function loadSermons() {
    const data = await getJSON('/api/sermons');
    const grid = $('#sermon-grid');
    const updated = $('#sermon-updated');

    updated.textContent = data.lastUpdated
      ? `마지막 업데이트: ${formatDate(data.lastUpdated)}`
      : '';

    if (!data.videos || data.videos.length === 0) {
      grid.innerHTML = `<div class="sermon-empty" style="grid-column:1/-1;">아직 등록된 설교 영상이 없습니다. 관리자 페이지에서 유튜브 채널을 연결해주세요.</div>`;
      return;
    }

    grid.innerHTML = data.videos
      .slice(0, 6)
      .map(
        (v) => `
        <div class="sermon-card" data-video-id="${escapeHtml(v.videoId)}">
          <div class="sermon-thumb">
            <img src="${v.thumbnail}" alt="${escapeHtml(v.title)}" loading="lazy" />
            <div class="play">
              <svg viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="11" fill="rgba(13,21,38,0.55)"/><path d="M9.5 7.5v9l8-4.5-8-4.5z" fill="white"/></svg>
            </div>
          </div>
          <div class="sermon-info">
            <div class="title">${escapeHtml(v.title)}</div>
            <div class="date">${formatDate(v.publishedAt)}</div>
          </div>
        </div>`
      )
      .join('');

    $$('.sermon-card').forEach((card) => {
      card.addEventListener('click', () => openVideoModal(card.dataset.videoId));
    });
  }

  // ---------------- 게시판 (소식·활동) ----------------
  let allPosts = [];

  // 저장된 content가 HTML(리치 에디터로 작성)이면 그대로, 순수 텍스트(줄바꿈만 있는 옛 글)면 줄바꿈을 <br>로 변환
  function renderContent(content = '') {
    if (/<[a-z][\s\S]*>/i.test(content)) return content;
    return escapeHtml(content).replace(/\n/g, '<br>');
  }

  // 목록에 보여줄 미리보기용 순수 텍스트 (HTML 태그 제거 + 길이 제한)
  function plainPreview(content = '', maxLen = 90) {
    const div = document.createElement('div');
    div.innerHTML = content;
    const text = (div.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  }

  function attachmentIcon() {
    return `<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>`;
  }

  function isImageAttachment(a) {
    return /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(a.url || a.name || '');
  }

  // 목록 카드에 쓸 대표 이미지: 대표 이미지 → 없으면 첫 이미지 첨부파일
  function thumbnailFor(post) {
    if (post.image) return post.image;
    const firstImg = (post.attachments || []).find(isImageAttachment);
    return firstImg ? firstImg.url : '';
  }

  function renderBoard(category) {
    const list = $('#board-list');
    const filtered = category === '전체' ? allPosts : allPosts.filter((p) => p.category === category);

    if (filtered.length === 0) {
      list.innerHTML = `<div class="board-empty">등록된 게시글이 없습니다.</div>`;
      return;
    }

    list.innerHTML = filtered
      .map((p) => {
        const thumb = thumbnailFor(p);
        return `
        <div class="board-card" data-id="${p.id}">
          <div class="board-thumb">
            ${thumb ? `<img src="${thumb}" alt="${escapeHtml(p.title)}" loading="lazy" />` : `<div class="board-thumb-empty">${escapeHtml((p.category || '')[0] || '소')}</div>`}
          </div>
          <div class="board-info">
            <div class="board-top">
              <span class="badge">${escapeHtml(p.category)}</span>
              <span class="date">${escapeHtml(p.date)}</span>
            </div>
            <h4>${p.pinned ? '<span class="pin">📌</span>' : ''}${escapeHtml(p.title)}</h4>
            <p>${escapeHtml(plainPreview(p.content))}</p>
          </div>
        </div>`;
      })
      .join('');

    $$('.board-card').forEach((item) => {
      item.addEventListener('click', () => openPostModal(item.dataset.id));
    });
  }

  function openPostModal(id) {
    const post = allPosts.find((p) => p.id === id);
    if (!post) return;

    $('#post-modal-badge').textContent = post.category || '';
    $('#post-modal-date').textContent = post.date || '';
    $('#post-modal-title').textContent = post.title || '';
    $('#post-modal-content').innerHTML = renderContent(post.content);

    const imgEl = $('#post-modal-image');
    if (post.image) {
      imgEl.src = post.image;
      imgEl.alt = post.title || '';
    } else {
      imgEl.removeAttribute('src');
    }

    const attachBox = $('#post-modal-attachments');
    const attachments = Array.isArray(post.attachments) ? post.attachments : [];
    const imageAttachments = attachments.filter(isImageAttachment);
    const fileAttachments = attachments.filter((a) => !isImageAttachment(a));

    const imagesHtml = imageAttachments
      .map(
        (a) => `<img class="attachment-image" src="${a.url}" alt="${escapeHtml(a.name || '첨부 이미지')}" loading="lazy" />`
      )
      .join('');

    const filesHtml = fileAttachments
      .map(
        (a) => `<a class="attachment-item" href="${a.url}" download target="_blank" rel="noopener">${attachmentIcon()}<span>${escapeHtml(a.name || '첨부파일')}</span></a>`
      )
      .join('');

    attachBox.innerHTML = imagesHtml + filesHtml;

    $('#post-modal').classList.add('open');
  }

  function closePostModal() {
    $('#post-modal').classList.remove('open');
  }
  $('#post-modal-close').addEventListener('click', closePostModal);
  $('#post-modal').addEventListener('click', (e) => {
    if (e.target.id === 'post-modal') closePostModal();
  });

  async function loadBoard() {
    allPosts = await getJSON('/api/posts');
    renderBoard('전체');

    $$('.board-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.board-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        renderBoard(tab.dataset.cat);
      });
    });
  }

  // ---------------- 초기 로드 ----------------
  Promise.all([loadSite(), loadMenu(), loadSermons(), loadBoard()]).catch((err) => {
    console.error('콘텐츠를 불러오는 중 오류가 발생했습니다:', err);
  });
})();
