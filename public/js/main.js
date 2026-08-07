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

  // ---------------- 스크롤 등장 애니메이션 ----------------
  // .reveal 클래스가 붙은 요소가 화면에 들어오면 .is-visible을 붙여 서서히 나타나게 합니다.
  // 게시판/설교영상처럼 나중에(비동기로) 그려지는 요소도 다시 넣어줄 수 있게 함수로 뒀습니다.
  const revealObserver =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                revealObserver.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
        )
      : null;

  function observeReveals(root = document) {
    const targets = root.querySelectorAll ? root.querySelectorAll('.reveal:not(.reveal-bound)') : [];
    targets.forEach((el) => {
      el.classList.add('reveal-bound');
      if (revealObserver) {
        revealObserver.observe(el);
      } else {
        el.classList.add('is-visible'); // IntersectionObserver 미지원 브라우저는 그냥 바로 보이게
      }
    });
  }

  // ---------------- 오시는 길 지도 ----------------
  // 카카오맵을 관리자 페이지에서 연결해뒀으면(kakaoMapImageUrl/kakaoMapLinkUrl) 그걸 우선 사용하고,
  // 없으면 예전 방식대로 iframe 임베드 URL(구글맵 등)을 사용합니다.

  function renderMap(contact) {
    const box = $('#map-box');
    if (!box) return;

    // 형식이 이상한 값은 아예 쓰지 않음 (카카오 지도 도메인 https 주소인지 재확인 - 2중 방어)
    const validImage = contact.kakaoMapImageUrl && /^https:\/\/staticmap\.kakao\.com\//.test(contact.kakaoMapImageUrl)
      ? contact.kakaoMapImageUrl
      : '';
    const validLink = contact.kakaoMapLinkUrl && /^https:\/\/map\.kakao\.com\//.test(contact.kakaoMapLinkUrl)
      ? contact.kakaoMapLinkUrl
      : '';

    if (validImage && validLink) {
      box.innerHTML = `
        <a class="kakao-map-preview" href="${validLink}" target="_blank" rel="noopener">
          <img src="${validImage}" alt="교회 위치 지도" loading="lazy" />
          <svg class="kakao-map-pin" viewBox="0 0 32 44" aria-hidden="true">
            <path d="M16 0C7.163 0 0 7.163 0 16c0 11 16 28 16 28s16-17 16-28C32 7.163 24.837 0 16 0z" fill="#0d1526"/>
            <circle cx="16" cy="16" r="6.5" fill="#c9a227"/>
          </svg>
          <span class="kakao-map-cta">카카오맵에서 크게 보기 →</span>
        </a>`;
      return;
    }

    if (contact.mapEmbedUrl) {
      box.innerHTML = `<iframe src="${contact.mapEmbedUrl}" loading="lazy" allowfullscreen></iframe>`;
    }
  }

  // ---------------- 방문/클릭 통계 수집 ----------------
  function track(type, data = {}) {
    const payload = JSON.stringify({ type, ...data });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(() => {});
    }
  }
  track('pageview', { path: location.pathname });

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
      // 기본 2종(노토 세리프/산스) 외의 폰트를 관리자가 선택한 경우에만 그 폰트를 추가로 불러옴
      window.ensureGoogleFont && window.ensureGoogleFont(site.design.headingFont);
      window.ensureGoogleFont && window.ensureGoogleFont(site.design.bodyFont);
      const headingFamily = window.getFontFamily(site.design.headingFont, "'Noto Serif KR', serif");
      const bodyFamily = window.getFontFamily(site.design.bodyFont, "'Pretendard', 'Noto Sans KR', sans-serif");
      document.documentElement.style.setProperty('--font-heading', headingFamily);
      document.documentElement.style.setProperty('--font-body', bodyFamily);
    }

    document.title = site.churchName || '물댄동산교회';
    $('#brand-name').textContent = site.churchName || '물댄동산교회';
    $('#footer-brand').textContent = site.churchName || '물댄동산교회';
    $('#footer-brand-2').textContent = site.churchName || '물댄동산교회';
    if (site.sermonsIntro) {
      $('#sermons-intro').textContent = site.sermonsIntro;
    }
    $('#footer-year').textContent = new Date().getFullYear();

    if (site.hero) {
      $('#hero-verse').textContent = site.hero.verse || '';
      $('#hero-verse-ref').textContent = site.hero.verseRef || '';
      $('#hero-subtitle').innerHTML = escapeHtml(site.hero.subtitle || '').replace(/\n/g, '<br>');
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

    if (site.missions) {
      $('#missions-title').textContent = site.missions.title || '선교와 섬김';
      $('#missions-verse').textContent = '"온 천하에 다니며 만민에게 복음을 전파하라" (마가복음 16:15)';
      $('#missions-subtitle').textContent = site.missions.subtitle || '';
      $('#partners-title').textContent = '동역해주시는 분들';
    }

    if (site.qtBackground) {
      applyQtBackground(site.qtBackground);
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
      if (site.contact.addressNote) {
        $('#contact-address-note').textContent = site.contact.addressNote;
        $('#contact-address-note').style.display = '';
      }
      $('#contact-phone').textContent = site.contact.phone || '';
      renderMap(site.contact);
    }

    if (site.offering && site.offering.bank && site.offering.account) {
      $('#offering-bank').textContent = site.offering.bank;
      $('#offering-account').textContent = site.offering.account;
      if (site.offering.holder) {
        $('#offering-holder').textContent = site.offering.holder;
      } else {
        $('.offering-holder-line').style.display = 'none';
      }
      $('#offering-note').textContent = site.offering.note || '';
      $('#offering').style.display = '';
      $('#offering-prayer-grid').classList.remove('offering-prayer-grid--single');
    } else {
      // 헌금 정보가 설정되지 않았으면 기도 요청 카드만 단독으로 넓게 보여준다
      $('#offering-prayer-grid').classList.add('offering-prayer-grid--single');
    }

    const footerSns = $('#footer-sns');
    const icons = {
      youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 7.2c-.2-1-1-1.7-1.9-1.9C18 5 12 5 12 5s-6 0-7.7.3c-1 .2-1.7 1-1.9 1.9C2 8.9 2 12 2 12s0 3.1.3 4.8c.2 1 1 1.7 1.9 1.9C6 19 12 19 12 19s6 0 7.7-.3c1-.2 1.7-1 1.9-1.9.3-1.7.3-4.8.3-4.8s0-3.1-.3-4.8ZM10 15.3V8.7L15.8 12 10 15.3Z"/></svg>',
      instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/></svg>',
      facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 9h3V5.6c-.5-.1-1.6-.2-2.8-.2-2.8 0-4.7 1.7-4.7 4.9V13H6.8v3.8H9.5V22h3.7v-5.2h2.9l.5-3.8h-3.4V10.6c0-1.1.3-1.6 1.8-1.6Z"/></svg>'
    };
    const links = [];
    if (site.sns) {
      if (site.sns.youtube) links.push(`<a href="${site.sns.youtube}" target="_blank" rel="noopener" aria-label="유튜브">${icons.youtube}</a>`);
      if (site.sns.instagram) links.push(`<a href="${site.sns.instagram}" target="_blank" rel="noopener" aria-label="인스타그램">${icons.instagram}</a>`);
      if (site.sns.facebook) links.push(`<a href="${site.sns.facebook}" target="_blank" rel="noopener" aria-label="페이스북">${icons.facebook}</a>`);
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
    const inner = $('#video-modal-inner');
    inner.style.aspectRatio = '16 / 9';
    inner.classList.remove('video-modal-inner--portrait');
    $('#video-modal-frame').innerHTML =
      `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" title="설교 영상" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    modal.classList.add('open');

    // 쇼츠처럼 세로 영상이면 실제 비율을 확인해서 화면을 세로로 꽉 채워 보여줍니다
    // (실패해도 기본 16:9로 그대로 보이니 문제없음)
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.width && data.height && data.height > data.width) {
          inner.style.aspectRatio = `${data.width} / ${data.height}`;
          inner.classList.add('video-modal-inner--portrait');
        }
      })
      .catch(() => {});
  }
  function closeVideoModal() {
    $('#video-modal').classList.remove('open');
    $('#video-modal-frame').innerHTML = '';
  }
  $('#video-modal-close').addEventListener('click', closeVideoModal);
  $('#video-modal').addEventListener('click', (e) => {
    if (e.target.id === 'video-modal') closeVideoModal();
  });

  // ---------------- 첨부파일(주보 등) 미리보기 ----------------
  function isPreviewable(name = '', url = '') {
    const ext = (name.split('.').pop() || url.split('.').pop() || '').toLowerCase();
    return ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
  }

  function openFileModal(url, name) {
    const ext = (name.split('.').pop() || url.split('.').pop() || '').toLowerCase();
    const frame = $('#file-modal-frame');
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
      frame.innerHTML = `<img src="${url}" alt="${escapeHtml(name)}" />`;
    } else {
      frame.innerHTML = `<iframe src="${url}" title="${escapeHtml(name)}"></iframe>`;
    }
    $('#file-modal-name').textContent = name;
    $('#file-modal-download').href = url;
    $('#file-modal').classList.add('open');
  }
  function closeFileModal() {
    $('#file-modal').classList.remove('open');
    $('#file-modal-frame').innerHTML = '';
  }
  $('#file-modal-close')?.addEventListener('click', closeFileModal);
  $('#file-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'file-modal') closeFileModal();
  });

  // 카드마다 다른 브랜드 톤을 자동으로 순환시켜서, 매주 비슷한 설교 화면이어도
  // 카드 느낌이 겹치지 않도록 합니다 (직접 디자인 안 해도 자동으로 다양해짐)
  const CARD_ACCENT_PALETTE = [
    '13, 21, 38', // 네이비(기본)
    '15, 42, 45', // 딥 틸
    '58, 18, 32', // 와인
    '20, 38, 26', // 포레스트
    '36, 26, 53', // 슬레이트 퍼플
    '42, 32, 21' // 웜 차콜
  ];
  function accentForId(id = '') {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return CARD_ACCENT_PALETTE[hash % CARD_ACCENT_PALETTE.length];
  }

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
      .map((v, i) => {
        const posterUrl = `/api/sermon-poster/${encodeURIComponent(v.videoId)}?title=${encodeURIComponent(v.title || '')}`;
        return `
        <div class="sermon-card reveal reveal-delay-${(i % 6) + 1}" data-video-id="${escapeHtml(v.videoId)}">
          <div class="sermon-thumb">
            <img src="${posterUrl}" alt="${escapeHtml(v.title)}" loading="lazy" onerror="this.onerror=null;this.src='${escapeHtml(v.thumbnail)}';" />
            <button type="button" class="sermon-play" aria-label="재생">
              <svg viewBox="0 0 24 24"><path d="M9.5 7.5v9l8-4.5-8-4.5z"/></svg>
            </button>
          </div>
        </div>`;
      })
      .join('');
    observeReveals(grid);

    $$('.sermon-card').forEach((card) => {
      card.addEventListener('click', () => {
        track('click', { label: 'sermon_card' });
        openVideoModal(card.dataset.videoId);
      });
    });
  }

  // ---------------- 찬양 ----------------
  async function loadPraises() {
    const praises = await getJSON('/api/praises');
    const section = $('#praise');
    const grid = $('#praise-grid');
    if (!praises || praises.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    grid.innerHTML = praises
      .map(
        (p, i) => `
        <div class="praise-card reveal reveal-delay-${(i % 6) + 1}" data-video-id="${escapeHtml(p.youtubeId)}" style="--accent-rgb: ${accentForId(p.youtubeId)};">
          <div class="praise-thumb">
            <img src="https://i.ytimg.com/vi/${escapeHtml(p.youtubeId)}/hqdefault.jpg" alt="${escapeHtml(p.title)}" loading="lazy" />
            <button type="button" class="praise-play" aria-label="재생">
              <svg viewBox="0 0 24 24"><path d="M9.5 7.5v9l8-4.5-8-4.5z"/></svg>
            </button>
            <div class="praise-overlay-text">
              <p class="title">${escapeHtml(p.title)}</p>
              ${p.singer ? `<p class="singer">${escapeHtml(p.singer)}</p>` : ''}
            </div>
          </div>
        </div>`
      )
      .join('');
    observeReveals(grid);

    $$('.praise-card').forEach((card) => {
      card.addEventListener('click', () => {
        track('click', { label: 'praise_card' });
        openVideoModal(card.dataset.videoId);
      });
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

  // 모바일에서 카테고리별로 노출할 최대 개수 (소식 3 / 활동 3 / 주보 최신 1)
  const BOARD_MOBILE_LIMITS = { 소식: 3, 활동: 3, 주보: 1 };
  const BOARD_PAGE_SIZE = 9; // PC 한 페이지당 노출 개수
  const isBoardMobile = () => window.matchMedia('(max-width: 900px)').matches;

  let boardCategory = '전체';
  let boardPage = 1;

  // 저장된 값은 예전 그대로(호환성) 두고, 화면에 보여줄 라벨만 바꿉니다.
  const CATEGORY_LABELS = { 활동: '친교' };
  const categoryLabel = (cat) => CATEGORY_LABELS[cat] || cat;

  function boardCardHTML(p, i = 0) {
    const thumb = thumbnailFor(p);
    return `
      <div class="board-card reveal reveal-delay-${(i % 6) + 1}" data-id="${p.id}">
        <div class="board-thumb">
          ${thumb ? `<img src="${thumb}" alt="${escapeHtml(p.title)}" loading="lazy" />` : `<div class="board-thumb-empty">${escapeHtml((p.category || '')[0] || '소')}</div>`}
        </div>
        <div class="board-info">
          <div class="board-top">
            <span class="badge">${escapeHtml(categoryLabel(p.category))}</span>
            <span class="date">${escapeHtml(p.date)}</span>
          </div>
          <h4>${p.pinned ? '<span class="pin">📌</span>' : ''}${escapeHtml(p.title)}</h4>
          <p>${escapeHtml(plainPreview(p.content))}</p>
        </div>
      </div>`;
  }

  // 모바일 "전체" 탭: 카테고리별 한도를 지키면서, 기존 정렬(상단고정→최신순) 순서는 그대로 유지
  function pickWithCategoryLimits(posts, limits) {
    const counts = {};
    const result = [];
    posts.forEach((p) => {
      const limit = limits[p.category];
      if (limit === undefined) return; // 정의되지 않은 카테고리는 노출하지 않음(현재는 소식/활동/주보 뿐)
      counts[p.category] = counts[p.category] || 0;
      if (counts[p.category] < limit) {
        result.push(p);
        counts[p.category]++;
      }
    });
    return result;
  }

  function renderBoardPagination(totalItems) {
    const pager = $('#board-pagination');
    const totalPages = Math.ceil(totalItems / BOARD_PAGE_SIZE);

    if (isBoardMobile() || totalPages <= 1) {
      pager.innerHTML = '';
      return;
    }

    const buttons = [];
    buttons.push(
      `<button class="board-page-btn board-page-nav" data-page="${boardPage - 1}" ${boardPage === 1 ? 'disabled' : ''} aria-label="이전 페이지">‹</button>`
    );
    for (let i = 1; i <= totalPages; i++) {
      buttons.push(
        `<button class="board-page-btn${i === boardPage ? ' active' : ''}" data-page="${i}">${i}</button>`
      );
    }
    buttons.push(
      `<button class="board-page-btn board-page-nav" data-page="${boardPage + 1}" ${boardPage === totalPages ? 'disabled' : ''} aria-label="다음 페이지">›</button>`
    );
    pager.innerHTML = buttons.join('');

    $$('.board-page-btn', pager).forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = Number(btn.dataset.page);
        if (!page || page === boardPage) return;
        boardPage = page;
        renderBoard();
        // 페이지를 넘기면 목록 상단이 보이도록 살짝 스크롤 보정
        $('#board').scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    });
  }

  function renderBoard() {
    const list = $('#board-list');
    const category = boardCategory;
    const byCategory = category === '전체' ? allPosts : allPosts.filter((p) => p.category === category);

    let pageItems;
    let totalForPagination;

    if (isBoardMobile()) {
      // 모바일: 페이지 넘김 없이 카테고리별 개수만 제한해서 보여준다
      if (category === '전체') {
        pageItems = pickWithCategoryLimits(allPosts, BOARD_MOBILE_LIMITS);
      } else {
        const limit = BOARD_MOBILE_LIMITS[category];
        pageItems = limit !== undefined ? byCategory.slice(0, limit) : byCategory;
      }
      totalForPagination = 0;
    } else {
      // PC: 9개씩, 페이지네이션
      const totalPages = Math.max(1, Math.ceil(byCategory.length / BOARD_PAGE_SIZE));
      if (boardPage > totalPages) boardPage = totalPages;
      const start = (boardPage - 1) * BOARD_PAGE_SIZE;
      pageItems = byCategory.slice(start, start + BOARD_PAGE_SIZE);
      totalForPagination = byCategory.length;
    }

    if (pageItems.length === 0) {
      list.innerHTML = `<div class="board-empty">등록된 게시글이 없습니다.</div>`;
    } else {
      list.innerHTML = pageItems.map((p, i) => boardCardHTML(p, i)).join('');
    }

    renderBoardPagination(totalForPagination);
    observeReveals(list);

    $$('.board-card').forEach((item) => {
      item.addEventListener('click', () => {
        track('click', { label: 'board_card' });
        openPostModal(item.dataset.id);
      });
    });
  }

  function openPostModal(id) {
    const post = allPosts.find((p) => p.id === id);
    if (!post) return;

    $('#post-modal-badge').textContent = categoryLabel(post.category) || '';
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
        (a) =>
          `<a class="attachment-item" href="${a.url}" data-name="${escapeHtml(a.name || '첨부파일')}" ${
            isPreviewable(a.name || '', a.url) ? 'data-preview="1"' : 'target="_blank" rel="noopener"'
          }>${attachmentIcon()}<span>${escapeHtml(a.name || '첨부파일')}</span></a>`
      )
      .join('');

    attachBox.innerHTML = imagesHtml + filesHtml;
    $$('#post-modal-attachments [data-preview="1"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        openFileModal(el.getAttribute('href'), el.dataset.name);
      });
    });

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
    boardCategory = '전체';
    boardPage = 1;
    renderBoard();

    $$('.board-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.board-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        boardCategory = tab.dataset.cat;
        boardPage = 1;
        renderBoard();
      });
    });

    // PC ↔ 모바일 화면 전환 시(창 크기 조절, 기기 회전 등) 표시 방식이 바뀌므로 다시 렌더링
    window.matchMedia('(max-width: 900px)').addEventListener('change', () => {
      boardPage = 1;
      renderBoard();
    });
  }

  // ---------------- 오늘의 큐티 ----------------
  function applyQtBackground(bg) {
    const stage = $('#qt-stage');
    const decor = $('#qt-decor');
    stage.classList.remove('qt-stage--navy', 'qt-stage--gold', 'qt-stage--dawn');
    if (bg.type === 'photo' && bg.image) {
      stage.style.background =
        `linear-gradient(180deg, rgba(13,21,38,0.55), rgba(13,21,38,0.75)), url('${bg.image}') center/cover no-repeat`;
      decor.style.display = 'none';
    } else {
      stage.style.background = '';
      stage.classList.add(`qt-stage--${bg.preset || 'navy'}`);
      decor.style.display = '';
    }
  }

  function formatQtDate(dateStr = '') {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }

  // 캐러셀을 "겹쳐진 카드가 옆으로 스르륵 밀려나는" 커버플로우 방식으로 제어한다.
  // activeIndex에 해당하는 카드가 가운데(delta=0)에 오고, 나머지는 좌우로 카드 너비의
  // 약 2/3만큼 떨어져(=1/3 겹쳐) 배치된다. 인덱스가 바뀌면 CSS transition이 슬라이드 애니메이션을 만든다.
  function createCoverflow(carousel, cardEls, initialIndex, { onChange } = {}) {
    const CARD_WIDTH = 340;
    const STEP = Math.round(CARD_WIDTH * 0.64); // 카드 너비의 약 1/3만큼 겹치도록
    let activeIndex = initialIndex;

    function layout() {
      cardEls.forEach((card, i) => {
        const delta = i - activeIndex;
        const abs = Math.abs(delta);
        const scale = delta === 0 ? 1 : abs === 1 ? 0.88 : 0.8;
        const opacity = delta === 0 ? 1 : abs === 1 ? 0.6 : abs === 2 ? 0.22 : 0;
        card.style.transform = `translate(-50%, -50%) translateX(${delta * STEP}px) scale(${scale})`;
        card.style.opacity = String(opacity);
        card.style.zIndex = String(100 - abs);
        card.style.pointerEvents = abs > 2 ? 'none' : '';
      });
      if (typeof onChange === 'function') onChange(activeIndex);
    }

    function goTo(i) {
      const next = Math.max(0, Math.min(cardEls.length - 1, i));
      if (next === activeIndex) return;
      activeIndex = next;
      layout();
    }

    // 가운데(활성) 카드가 아닌 카드를 클릭하면 그 카드가 가운데로 이동하고,
    // 이미 가운데인 카드를 클릭하면 원래 링크(상세 페이지)로 정상 이동한다.
    cardEls.forEach((card, i) => {
      card.addEventListener('click', (e) => {
        if (i !== activeIndex) {
          e.preventDefault();
          goTo(i);
        }
      });
    });

    // 드래그/스와이프로도 넘길 수 있게 처리
    let isDown = false;
    let dragged = false;
    let startX = 0;

    carousel.addEventListener('pointerdown', (e) => {
      isDown = true;
      dragged = false;
      startX = e.clientX;
      carousel.classList.add('dragging');
      // 여기서 바로 setPointerCapture를 걸면, 단순 클릭이어도 mouseup/click 이벤트의
      // 대상이 카드(<a>)가 아니라 캐러셀로 바뀌어 카드의 기본 동작(페이지 이동)이
      // 막혀버린다. 그래서 캡처는 아래 pointermove에서 "진짜 드래그"로 확정된
      // 순간에만 건다.
    });
    carousel.addEventListener('pointermove', (e) => {
      if (!isDown) return;
      // 클릭 시 손이 미세하게 떨리는 정도(수 px)는 드래그로 오인하지 않도록 기준을 넉넉히 잡는다.
      if (!dragged && Math.abs(e.clientX - startX) > 15) {
        dragged = true;
        // 진짜 드래그로 확정된 시점에만 캡처를 걸어, 커서가 캐러셀 영역 밖으로
        // 나가도 드래그를 계속 추적할 수 있게 한다.
        carousel.setPointerCapture(e.pointerId);
      }
    });
    const finishDrag = (e) => {
      // 포인터 캡처를 풀어줘야 클릭이 끝나는 지점(mouseup)이 실제 카드(<a>) 위로
      // 정상적으로 인식되어, 카드 클릭 시 상세 페이지 이동(전체 보기)이 막히지 않는다.
      if (carousel.hasPointerCapture && carousel.hasPointerCapture(e.pointerId)) {
        carousel.releasePointerCapture(e.pointerId);
      }
      if (!isDown) return;
      isDown = false;
      carousel.classList.remove('dragging');
      if (!dragged) return;
      const dx = e.clientX - startX;
      if (dx < -40) goTo(activeIndex + 1);
      else if (dx > 40) goTo(activeIndex - 1);
    };
    carousel.addEventListener('pointerup', finishDrag);
    carousel.addEventListener('pointercancel', finishDrag);
    carousel.addEventListener(
      'click',
      (e) => {
        if (dragged) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );

    layout();
    return {
      goTo,
      next: () => goTo(activeIndex + 1),
      prev: () => goTo(activeIndex - 1),
      get activeIndex() {
        return activeIndex;
      }
    };
  }

  async function loadQT() {
    const list = await getJSON('/api/qt');
    const stage = $('#qt-stage');
    const carousel = $('#qt-carousel');
    const trackEl = $('#qt-carousel-track');
    const navPrev = $('#qt-nav-prev');
    const navNext = $('#qt-nav-next');
    const toggleWrap = $('.qt-archive-toggle-wrap');
    const archiveList = $('#qt-archive-list');

    if (!list || list.length === 0) {
      trackEl.innerHTML = `<p class="qt-empty">아직 등록된 큐티가 없습니다.</p>`;
      navPrev.style.display = 'none';
      navNext.style.display = 'none';
      toggleWrap.style.display = 'none';
      return;
    }

    const [latest, ...rest] = list;
    const isDesktop = window.matchMedia('(min-width: 861px)').matches;

    // 캐러셀에는 오늘 카드 + 최근 지난 큐티 몇 장만(오래된 순 → 오늘 순으로 배치해
    // 오늘 카드가 맨 오른쪽=가운데 정렬 기준이 되도록 함)
    // 모바일에서는 좁은 화면에 여러 장이 겹쳐 보이지 않도록 "오늘의 큐티" 카드 1개만 렌더링한다.
    const carouselPast = isDesktop ? rest.slice(0, 5).reverse() : [];

    const archiveCardHtml = (q) => `
      <a class="qt-card qt-card--archive" href="/qt/${q.id}" data-id="${q.id}">
        <span class="qt-badge qt-badge--archive">${formatQtDate(q.date)}</span>
        <h3 class="qt-card-title">${escapeHtml(q.title || '')}</h3>
        ${q.verseRef ? `<p class="qt-card-ref">${escapeHtml(q.verseRef)}</p>` : ''}
      </a>`;

    const todayCardHtml = `
      <a class="qt-card qt-card--today" href="/qt/${latest.id}" data-id="${latest.id}">
        <span class="qt-badge">오늘의 큐티</span>
        <h3 class="qt-card-title">${escapeHtml(latest.title || '')}</h3>
        ${latest.verseRef ? `<p class="qt-card-ref">${escapeHtml(latest.verseRef)}</p>` : ''}
        <div class="qt-card-foot">
          <span>${escapeHtml(latest.pastor || '')}${latest.pastor ? ' · ' : ''}${formatQtDate(latest.date)}</span>
          <span>전체 보기 →</span>
        </div>
      </a>`;

    trackEl.innerHTML = carouselPast.map(archiveCardHtml).join('') + todayCardHtml;

    $$('#qt-carousel-track .qt-card--today').forEach((c) => c.addEventListener('click', () => track('click', { label: 'qt_card' })));
    $$('#qt-carousel-track .qt-card--archive').forEach((c) => c.addEventListener('click', () => track('click', { label: 'qt_carousel_archive' })));

    const todayIndex = carouselPast.length; // 오늘 카드는 배열 맨 뒤(오른쪽)에 위치

    if (carouselPast.length === 0 || !isDesktop) {
      stage.classList.add('qt-stage--single');
      navPrev.style.display = 'none';
      navNext.style.display = 'none';
    } else {
      stage.classList.remove('qt-stage--single');
      navPrev.style.display = '';
      navNext.style.display = '';
      carousel.classList.add('qt-carousel--coverflow');

      const cardEls = $$('#qt-carousel-track .qt-card');
      const coverflow = createCoverflow(carousel, cardEls, todayIndex, {
        onChange: (activeIndex) => {
          navPrev.disabled = activeIndex === 0;
          navNext.disabled = activeIndex === cardEls.length - 1;
        }
      });
      navPrev.addEventListener('click', () => coverflow.prev());
      navNext.addEventListener('click', () => coverflow.next());
    }

    if (rest.length === 0) {
      toggleWrap.style.display = 'none';
      return;
    }

    archiveList.innerHTML = rest
      .map(
        (q) => `
        <a class="qt-archive-row" href="/qt/${q.id}">
          <span class="date">${formatQtDate(q.date)}</span>
          <span class="title">${escapeHtml(q.title || '')}</span>
        </a>`
      )
      .join('');

    $$('.qt-archive-row').forEach((row) => {
      row.addEventListener('click', () => track('click', { label: 'qt_archive_row' }));
    });

    $('#qt-archive-toggle').addEventListener('click', () => {
      const isOpen = archiveList.classList.toggle('open');
      $('#qt-archive-toggle').textContent = isOpen ? '지난 큐티 접기 ▴' : '지난 큐티 보기 ▾';
    });
  }

  // ---------------- 선교사역 (세계지도 + 동역자의 섬김) ----------------
  function daysSince(dateStr) {
    if (!dateStr) return null;
    const start = new Date(dateStr);
    if (isNaN(start.getTime())) return null;
    return Math.floor((Date.now() - start.getTime()) / 86400000) + 1;
  }

  // 좌표가 같거나(같은 도시) 매우 가까운 여러 선교지를 하나의 핀+카드로 묶어서 보여줍니다.
  // 각 항목을 카드 안에서 구분선으로 나눠 나란히 표시합니다.
  function missionGroupCardHTML(group) {
    const first = group[0];
    const flag = window.isoToFlag ? window.isoToFlag(first.countryCode) : '';
    const items = group
      .map(
        (m) => `
        <div class="mission-pin-card-body">
          ${m.image ? `<img src="${m.image}" alt="${escapeHtml(m.name || '')}" />` : `<div class="mission-pin-card-avatar"></div>`}
          <div>
            <p class="name">${escapeHtml(m.name || '')}${m.tag ? ` <span class="tag">${escapeHtml(m.tag)}</span>` : ''}</p>
            <p class="desc">${escapeHtml(m.desc || '').replace(/\n/g, '<br>')}</p>
          </div>
        </div>`
      )
      .join('<hr class="mission-pin-card-divider" />');

    return `
      <div class="mission-pin-card">
        <div class="mission-pin-card-head">
          <span class="flag">${flag}</span>
          <span class="country">${escapeHtml(first.country || '')}</span>
        </div>
        ${items}
      </div>`;
  }

  function renderMissionsMobileList(missions) {
    const wrap = $('#missions-mobile-list');
    if (!missions.length) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = missions
      .map(
        (m) => `
        <div class="mission-mobile-card">
          <span class="mission-mobile-badge">${window.isoToFlag ? window.isoToFlag(m.countryCode) : ''} ${escapeHtml(m.tag || m.country || '')}</span>
          <div class="mission-pin-card-body">
            ${m.image ? `<img src="${m.image}" alt="${escapeHtml(m.name || '')}" />` : `<div class="mission-pin-card-avatar"></div>`}
            <div>
              <p class="name">${escapeHtml(m.name || '')}</p>
              <p class="desc">${escapeHtml(m.desc || '').replace(/\n/g, '<br>')}</p>
            </div>
          </div>
        </div>`
      )
      .join('');
  }

  function renderMissionsMap(missions) {
    const mapEl = $('#missions-map');
    mapEl.innerHTML = '';
    if (!missions.length || typeof d3 === 'undefined' || typeof topojson === 'undefined') return;

    const width = 620;
    const height = 460;
    const svg = d3
      .select(mapEl)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .style('display', 'block');

    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then((world) => {
        const countries = topojson.feature(world, world.objects.countries);
        const pointFeatures = {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', geometry: { type: 'Point', coordinates: [127.8, 36.5] } }, // 대한민국 기준점
            ...missions.map((m) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [m.lon, m.lat] } }))
          ]
        };
        const projection = d3.geoMercator().fitExtent(
          [
            [50, 40],
            [width - 50, height - 40]
          ],
          pointFeatures
        );
        const path = d3.geoPath(projection);

        svg
          .append('g')
          .selectAll('path')
          .data(countries.features)
          .join('path')
          .attr('d', path)
          .attr('fill', 'var(--line)')
          .attr('stroke', 'var(--ivory-dim)')
          .attr('stroke-width', 0.6);

        const pinGroup = svg.append('g');

        // 같은 나라/도시라서 좌표가 같거나 아주 가까운 선교지가 여러 개면 핀과 카드가
        // 겹쳐서 일부만 보이는 문제가 있었습니다. 좌표를 먼저 계산해서, 몇 픽셀 이내로
        // 겹치는 항목들은 하나의 핀 + 하나의 통합 카드로 묶어서 모두 보이게 합니다.
        const positioned = missions.map((m) => {
          const [x, y] = projection([m.lon, m.lat]);
          return { m, x, y };
        });
        const collisionGroups = {};
        const groupOrder = [];
        positioned.forEach((p) => {
          const key = `${Math.round(p.x / 8)}_${Math.round(p.y / 8)}`;
          if (!collisionGroups[key]) {
            collisionGroups[key] = [];
            groupOrder.push(key);
          }
          collisionGroups[key].push(p);
        });

        groupOrder.forEach((key) => {
          const group = collisionGroups[key];
          // 그룹 내 평균 좌표를 핀 위치로 사용
          const x = group.reduce((sum, p) => sum + p.x, 0) / group.length;
          const y = group.reduce((sum, p) => sum + p.y, 0) / group.length;
          const missionsInGroup = group.map((p) => p.m);

          pinGroup
            .append('circle')
            .attr('cx', x)
            .attr('cy', y)
            .attr('r', 7)
            .attr('fill', 'var(--gold)')
            .attr('stroke', 'var(--ivory)')
            .attr('stroke-width', 1.5)
            .append('title')
            .text(missionsInGroup.map((m) => `${m.country || ''}${m.name ? ' - ' + m.name : ''}`).join(', '));

          if (missionsInGroup.length > 1) {
            pinGroup
              .append('text')
              .attr('x', x)
              .attr('y', y)
              .attr('text-anchor', 'middle')
              .attr('dominant-baseline', 'central')
              .attr('font-size', '9px')
              .attr('font-weight', '700')
              .attr('fill', 'var(--navy-deep)')
              .style('pointer-events', 'none')
              .text(missionsInGroup.length);
          }

          const flipX = x > width * 0.62;
          const div = document.createElement('div');
          div.className = 'mission-pin-card-wrap' + (flipX ? ' flip' : '');
          div.style.left = (x / width) * 100 + '%';
          div.style.top = (y / height) * 100 + '%';
          div.innerHTML = missionGroupCardHTML(missionsInGroup);
          mapEl.appendChild(div);
        });
      })
      .catch((err) => console.error('세계지도를 불러오지 못했습니다:', err));
  }

  function renderPartners(partners) {
    const listEl = $('#partners-list');
    const pageEl = $('#partners-page');
    const prevBtn = $('#partners-prev');
    const nextBtn = $('#partners-next');
    const perPage = 5;
    const totalPages = Math.max(1, Math.ceil(partners.length / perPage));
    let page = 0;

    function draw() {
      const slice = partners.slice(page * perPage, page * perPage + perPage);
      listEl.innerHTML = slice
        .map((p) => {
          const days = daysSince(p.startDate);
          return `
          <div class="partner-row">
            ${p.image ? `<img src="${p.image}" alt="${escapeHtml(p.name || '')}" />` : `<div class="partner-avatar"></div>`}
            <div class="partner-info">
              <p class="name">${escapeHtml(p.name || '')}</p>
              ${p.note ? `<p class="note">${escapeHtml(p.note)}</p>` : ''}
            </div>
            ${days !== null ? `<span class="partner-day">D+${days}</span>` : ''}
          </div>`;
        })
        .join('');
      pageEl.textContent = totalPages > 1 ? `${page + 1} / ${totalPages}` : '';
      prevBtn.disabled = totalPages <= 1;
      nextBtn.disabled = totalPages <= 1;
    }

    prevBtn.onclick = () => {
      page = (page - 1 + totalPages) % totalPages;
      draw();
    };
    nextBtn.onclick = () => {
      page = (page + 1) % totalPages;
      draw();
    };
    draw();
  }

  async function loadMissions() {
    const [missions, partners] = await Promise.all([getJSON('/api/missions'), getJSON('/api/partners')]);
    const missionsList = missions || [];
    const partnersList = partners || [];

    if (missionsList.length === 0 && partnersList.length === 0) {
      $('#missions').style.display = 'none';
      return;
    }

    const isDesktop = window.matchMedia('(min-width: 861px)').matches;

    if (missionsList.length === 0) {
      $('.missions-map-wrap').style.display = 'none';
      $('#missions-mobile-list').innerHTML = '';
    } else if (isDesktop) {
      $('.missions-map-wrap').style.display = '';
      $('#missions-mobile-list').style.display = 'none';
      renderMissionsMap(missionsList);
    } else {
      $('.missions-map-wrap').style.display = 'none';
      $('#missions-mobile-list').style.display = '';
      renderMissionsMobileList(missionsList);
    }

    if (partnersList.length === 0) {
      $('.missions-partners').style.display = 'none';
    } else {
      $('.missions-partners').style.display = '';
      renderPartners(partnersList);
    }
  }

  // ---------------- PWA: 서비스워커 등록 ----------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 서비스워커 등록에 실패해도 사이트 이용에는 지장이 없으므로 조용히 무시
      });
    });
  }

  // ---------------- 초기 로드 ----------------
  observeReveals(); // 정적으로 이미 있는 섹션 제목/카드 등에 스크롤 등장 애니메이션 연결
  Promise.all([loadSite(), loadMenu(), loadSermons(), loadPraises(), loadBoard(), loadQT(), loadMissions()]).catch((err) => {
    console.error('콘텐츠를 불러오는 중 오류가 발생했습니다:', err);
  });
})();
