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
  function renderBoard(category) {
    const list = $('#board-list');
    const filtered = category === '전체' ? allPosts : allPosts.filter((p) => p.category === category);

    if (filtered.length === 0) {
      list.innerHTML = `<div class="board-empty">등록된 게시글이 없습니다.</div>`;
      return;
    }

    list.innerHTML = filtered
      .map(
        (p) => `
        <div class="board-item">
          <span class="badge">${escapeHtml(p.category)}</span>
          <div>
            <h4>${p.pinned ? '<span class="pin">📌</span>' : ''}${escapeHtml(p.title)}</h4>
            <p>${escapeHtml(p.content)}</p>
          </div>
          <span class="date">${escapeHtml(p.date)}</span>
        </div>`
      )
      .join('');
  }

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
