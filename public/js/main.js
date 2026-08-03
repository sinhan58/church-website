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
      $('#contact-email').textContent = site.contact.email || '';
      if (site.contact.mapEmbedUrl) {
        $('#map-box').innerHTML = `<iframe src="${site.contact.mapEmbedUrl}" loading="lazy" allowfullscreen></iframe>`;
      }
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
      card.addEventListener('click', () => {
        track('click', { label: 'sermon_card' });
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
      item.addEventListener('click', () => {
        track('click', { label: 'board_card' });
        openPostModal(item.dataset.id);
      });
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
    renderBoard('전체');

    $$('.board-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.board-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        renderBoard(tab.dataset.cat);
      });
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
      carousel.setPointerCapture(e.pointerId);
    });
    carousel.addEventListener('pointermove', (e) => {
      if (!isDown) return;
      if (Math.abs(e.clientX - startX) > 6) dragged = true;
    });
    const finishDrag = (e) => {
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

    // 캐러셀에는 오늘 카드 + 최근 지난 큐티 몇 장만(오래된 순 → 오늘 순으로 배치해
    // 오늘 카드가 맨 오른쪽=가운데 정렬 기준이 되도록 함)
    const carouselPast = rest.slice(0, 5).reverse();

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

    const isDesktop = window.matchMedia('(min-width: 861px)').matches;
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

  // ---------------- 초기 로드 ----------------
  Promise.all([loadSite(), loadMenu(), loadSermons(), loadBoard(), loadQT()]).catch((err) => {
    console.error('콘텐츠를 불러오는 중 오류가 발생했습니다:', err);
  });
})();
