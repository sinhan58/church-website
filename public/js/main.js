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
  // 화면에 들어오면 나타나고, 화면 밖으로 나가면 사라졌다가, 다시 스크롤해서
  // 들어오면 또 나타나도록 반복합니다 (한 번 보고 나면 계속 그대로 두지 않음).
  const revealObserver =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              entry.target.classList.toggle('is-visible', entry.isIntersecting);
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
        el.classList.add('is-visible');
      }
    });
  }

  function renderMap(contact) {
    const box = $('#map-box');
    if (!box) return;

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

  function getDeviceType() {
    return window.matchMedia('(max-width: 860px)').matches ? 'mobile' : 'desktop';
  }

  function track(type, data = {}) {
    const payload = JSON.stringify({ type, device: getDeviceType(), ...data });
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

  // ---------------- 페이지 체류시간 기록 ----------------
  // 방문자가 이 페이지를 얼마나 오래 보고 있었는지 기록합니다. 탭을 다른 화면으로
  // 전환하거나(visibilitychange) 페이지를 완전히 떠날 때(pagehide) 그때까지의
  // 경과 시간을 서버로 보냅니다. 1초 이상이면 전부 기록합니다.
  (function setupTimeSpentTracking() {
    let startTime = Date.now();
    let sent = false;

    function sendElapsed() {
      if (sent) return;
      const seconds = Math.round((Date.now() - startTime) / 1000);
      if (seconds >= 1) {
        track('timespent', { path: location.pathname, seconds });
        sent = true;
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        sendElapsed();
      } else if (document.visibilityState === 'visible') {
        // 다시 돌아오면 새로운 체류 구간으로 다시 잼
        startTime = Date.now();
        sent = false;
      }
    });
    window.addEventListener('pagehide', sendElapsed);
  })();

  // ---------------- 모달 열림 중 배경 스크롤 막기 ----------------
  // 게시글 상세 보기 위에 사진 확대 창이 겹쳐 뜨는 것처럼 모달이 동시에 여러 개
  // 열릴 수 있어서, 단순 on/off 대신 몇 개가 열려있는지 세어서 마지막 하나가
  // 닫힐 때만 배경 스크롤을 다시 풀어줍니다.
  let openModalCount = 0;
  function lockScroll() {
    openModalCount++;
    document.body.classList.add('modal-open');
  }
  function unlockScroll() {
    openModalCount = Math.max(0, openModalCount - 1);
    if (openModalCount === 0) {
      document.body.classList.remove('modal-open');
    }
  }

  // ---------------- 헤더 스크롤 효과 ----------------
  const header = $('#site-header');
  let headerTicking = false;

  function updateHeaderState() {
    const isScrolled = header.classList.contains('scrolled');
    if (!isScrolled && window.scrollY > 60) {
      header.classList.add('scrolled');
    } else if (isScrolled && window.scrollY < 30) {
      header.classList.remove('scrolled');
    }
    headerTicking = false;
  }

  window.addEventListener('scroll', () => {
    if (!headerTicking) {
      headerTicking = true;
      requestAnimationFrame(updateHeaderState);
    }
  }, { passive: true });
  updateHeaderState();

  // ---------------- 관리자 페이지 숨겨진 입구 ----------------
  // 방문자 눈에 띄지 않도록 "관리자" 링크는 없앴습니다. 대신 헤더의 교회 이름(로고)을
  // 3초 안에 5번 연속 클릭/탭하면 관리자 로그인 화면으로 이동합니다. (클릭 기반이라
  // 휴대폰 터치·PC 마우스 클릭 둘 다 똑같이 작동합니다)
  const brandLink = $('#brand-name');
  if (brandLink) {
    let brandTapCount = 0;
    let brandTapTimer = null;
    brandLink.addEventListener('click', (e) => {
      brandTapCount += 1;
      clearTimeout(brandTapTimer);
      brandTapTimer = setTimeout(() => {
        brandTapCount = 0;
      }, 3000);
      if (brandTapCount >= 5) {
        e.preventDefault(); // 홈 화면 스크롤 이동 대신 관리자 페이지로 이동
        brandTapCount = 0;
        window.location.href = '/admin';
      }
    });
  }

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
  // 대문(히어로) 배경 사진 슬라이드쇼: 사진을 여러 장 등록하면 몇 초마다 자연스럽게
  // 다음 사진으로 넘어갑니다. 두 개의 레이어(a/b)를 번갈아 써서, 다음 사진이 완전히
  // 준비된 뒤에 부드럽게 겹쳐 나타나도록(크로스페이드) 합니다. 사진이 1장이면 그냥
  // 고정된 사진으로 보이고(자동 전환 없음), 여러 장이면 6초 간격으로 넘어갑니다.
  //
  // 대문 영역이 화면에 실제로 보일 때만 타이머가 돌아가고, 스크롤해서 안 보이는
  // 동안에는 멈춥니다. (안 보이는 동안에도 계속 돌아가면 불필요하게 화면을 계속
  // 갱신하게 되어, 일부 기기에서 시스템의 화면 밝기 자동 조절 처리와 겹쳐 화면
  // 전체가 깜빡이는 현상이 있었습니다)
  let heroSlideTimer = null;
  let heroSlideActiveLayer = 'a';
  let heroSlideList = [];
  let heroSlideIndex = 0;
  let heroVisibilityObserver = null;

  function preloadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve(); // 사진 하나가 깨져도 슬라이드쇼 전체가 멈추지 않도록
      img.src = url;
    });
  }

  async function tickHeroSlide() {
    if (heroSlideList.length <= 1) return;
    const layerA = $('#hero-bg-photo-a');
    const layerB = $('#hero-bg-photo-b');
    const nextIndex = (heroSlideIndex + 1) % heroSlideList.length;
    await preloadImage(heroSlideList[nextIndex]);
    const showing = heroSlideActiveLayer === 'a' ? layerA : layerB;
    const hidden = heroSlideActiveLayer === 'a' ? layerB : layerA;
    hidden.style.backgroundImage = `url('${heroSlideList[nextIndex]}')`;
    hidden.classList.add('is-visible');
    showing.classList.remove('is-visible');
    heroSlideActiveLayer = heroSlideActiveLayer === 'a' ? 'b' : 'a';
    heroSlideIndex = nextIndex;
  }

  function resumeHeroSlideshow() {
    if (heroSlideTimer || heroSlideList.length <= 1) return;
    heroSlideTimer = setInterval(tickHeroSlide, 6000);
  }

  function pauseHeroSlideshow() {
    if (heroSlideTimer) {
      clearInterval(heroSlideTimer);
      heroSlideTimer = null;
    }
  }

  async function startHeroSlideshow(images) {
    heroSlideList = (images || []).filter(Boolean);
    if (heroSlideList.length === 0) return;

    const layerA = $('#hero-bg-photo-a');
    const layerB = $('#hero-bg-photo-b');
    pauseHeroSlideshow();

    await preloadImage(heroSlideList[0]);
    layerA.style.backgroundImage = `url('${heroSlideList[0]}')`;
    layerA.classList.add('is-visible');
    layerB.classList.remove('is-visible');
    heroSlideActiveLayer = 'a';
    heroSlideIndex = 0;

    if (heroSlideList.length <= 1) return; // 사진이 1장뿐이면 자동 전환 없이 고정

    const heroEl = $('#home');
    if ('IntersectionObserver' in window && heroEl) {
      if (!heroVisibilityObserver) {
        heroVisibilityObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) resumeHeroSlideshow();
              else pauseHeroSlideshow();
            });
          },
          { threshold: 0.01 }
        );
      }
      heroVisibilityObserver.observe(heroEl);
    } else {
      resumeHeroSlideshow(); // 구형 브라우저는 화면 감지가 안 되니 그냥 계속 돌립니다
    }
  }

  async function loadSite() {
    const site = await getJSON('/api/site');

    if (site.design) {
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
      if (Array.isArray(site.hero.backgroundImages) && site.hero.backgroundImages.length) {
        startHeroSlideshow(site.hero.backgroundImages);
      } else if (site.hero.backgroundImage) {
        // 예전 방식(사진 1장)으로 저장된 경우를 위한 호환 처리
        startHeroSlideshow([site.hero.backgroundImage]);
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
      $('#offering-prayer-grid').classList.add('offering-prayer-grid--single');
    }

    const footerSns = $('#footer-sns');
    const icons = {
      youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 7.2c-.2-1-1-1.7-1.9-1.9C18 5 12 5 12 5s-6 0-7.7.3c-1 .2-1.7 1-1.9 1.9C2 8.9 2 12 2 12s0 3.1.3 4.8c.2 1 1 1.7 1.9 1.9C6 19 12 19 12 19s6 0 7.7-.3c1-.2 1.7-1 1.9-1.9.3-1.7.3-4.8.3-4.8s0-3.1-.3-4.8ZM10 15.3V8.7L15.8 12 10 15.3Z"/></svg>',
      instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/></svg>',
      facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 9h3V5.6c-.5-.1-1.6-.2-2.8-.2-2.8 0-4.7 1.7-4.7 4.9V13H6.8v3.8H9.5V22h3.7v-5.2h2.9l.5-3.8h-3.4V10.6c0-1.1.3-1.6 1.8-1.6Z"/></svg>',
      // 정확한 밴드 로고 모양 대신, 확실하게 깨지지 않는 단순한 글자 배지로 표시합니다.
      band: '<span style="font-weight:800;font-size:0.72rem;letter-spacing:-0.02em;">BAND</span>'
    };

    // 주소 맨 앞에 https:// 가 빠져있으면 자동으로 붙여줍니다. (빠진 채로 저장되면
    // 브라우저가 외부 주소가 아니라 "우리 사이트 안의 경로"로 착각해서, 눌러도 그냥
    // 우리 홈페이지로 다시 돌아와버리는 문제가 있었습니다)
    function normalizeExternalUrl(url = '') {
      const trimmed = url.trim();
      if (!trimmed) return '';
      return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    }

    const links = [];
    if (site.sns) {
      if (site.sns.youtube) links.push(`<a href="${normalizeExternalUrl(site.sns.youtube)}" target="_blank" rel="noopener" aria-label="유튜브">${icons.youtube}</a>`);
      if (site.sns.instagram) links.push(`<a href="${normalizeExternalUrl(site.sns.instagram)}" target="_blank" rel="noopener" aria-label="인스타그램">${icons.instagram}</a>`);
      if (site.sns.facebook) links.push(`<a href="${normalizeExternalUrl(site.sns.facebook)}" target="_blank" rel="noopener" aria-label="페이스북">${icons.facebook}</a>`);
      if (site.sns.band) links.push(`<a href="${normalizeExternalUrl(site.sns.band)}" target="_blank" rel="noopener" aria-label="네이버 밴드">${icons.band}</a>`);
    }
    footerSns.innerHTML = links.join('');

    // 오른쪽 하단에 떠있는 밴드 바로가기 버튼 (밴드 주소를 등록해두신 경우에만 보임)
    const bandFab = $('#band-fab');
    if (bandFab) {
      if (site.sns && site.sns.band) {
        bandFab.href = normalizeExternalUrl(site.sns.band);
        bandFab.style.display = 'flex';
      } else {
        bandFab.style.display = 'none';
      }
    }
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

  function sizeVideoModal(ratioW, ratioH) {
    const inner = $('#video-modal-inner');
    const maxW = Math.min(window.innerWidth * 0.92, 1100);
    const maxH = window.innerHeight * 0.85;
    let w = maxW;
    let h = (w * ratioH) / ratioW;
    if (h > maxH) {
      h = maxH;
      w = (h * ratioW) / ratioH;
    }
    inner.style.width = `${w}px`;
    inner.style.height = `${h}px`;
  }

  function openVideoModal(videoId) {
    const modal = $('#video-modal');
    const inner = $('#video-modal-inner');
    inner.classList.remove('video-modal-inner--portrait');
    sizeVideoModal(16, 9);
    $('#video-modal-frame').innerHTML =
      `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" title="설교 영상" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    modal.classList.add('open');
    lockScroll();

    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.width && data.height && data.height > data.width) {
          sizeVideoModal(data.width, data.height);
          inner.classList.add('video-modal-inner--portrait');
        }
      })
      .catch(() => {});
  }
  function closeVideoModal() {
    $('#video-modal').classList.remove('open');
    $('#video-modal-frame').innerHTML = '';
    unlockScroll();
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
    lockScroll();
  }
  function closeFileModal() {
    $('#file-modal').classList.remove('open');
    $('#file-modal-frame').innerHTML = '';
    unlockScroll();
  }
  $('#file-modal-close')?.addEventListener('click', closeFileModal);
  $('#file-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'file-modal') closeFileModal();
  });

  // ---------------- 사진 확대 보기 ----------------
  function openImageLightbox(url, alt) {
    $('#image-lightbox-img').src = url;
    $('#image-lightbox-img').alt = alt || '';
    $('#image-lightbox').classList.add('open');
    lockScroll();
  }
  function closeImageLightbox() {
    $('#image-lightbox').classList.remove('open');
    $('#image-lightbox-img').src = '';
    unlockScroll();
  }
  $('#image-lightbox-close')?.addEventListener('click', closeImageLightbox);
  $('#image-lightbox')?.addEventListener('click', (e) => {
    if (e.target.id === 'image-lightbox') closeImageLightbox();
  });

  const CARD_ACCENT_PALETTE = [
    '13, 21, 38',
    '15, 42, 45',
    '58, 18, 32',
    '20, 38, 26',
    '36, 26, 53',
    '42, 32, 21'
  ];
  function accentForId(id = '') {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return CARD_ACCENT_PALETTE[hash % CARD_ACCENT_PALETTE.length];
  }

  async function loadSermons() {
    const [data, site] = await Promise.all([getJSON('/api/sermons'), getJSON('/api/site')]);
    const grid = $('#sermon-grid');
    const updated = $('#sermon-updated');

    updated.textContent = data.lastUpdated
      ? `마지막 업데이트: ${formatDate(data.lastUpdated)}`
      : '';

    if (!data.videos || data.videos.length === 0) {
      grid.innerHTML = `<div class="sermon-empty" style="grid-column:1/-1;">아직 등록된 설교 영상이 없습니다. 관리자 페이지에서 유튜브 채널을 연결해주세요.</div>`;
      return;
    }

    // ---- 노출 순서 구성: ①이번 주일 설교(최신) → ②③관리자 큐레이션(설정된 만큼) → 나머지 최신순 ----
    const videos = data.videos.slice();
    const latest = videos[0];
    const curations = (site && Array.isArray(site.sermonCurations) ? site.sermonCurations : []).filter(
      (c) => c && c.videoId
    );

    const ordered = [latest];
    const badges = { 0: '이번 주일 설교' };
    curations.slice(0, 2).forEach((cur) => {
      const video = videos.find((v) => v.videoId === cur.videoId);
      if (video && !ordered.some((o) => o.videoId === video.videoId)) {
        badges[ordered.length] = cur.label || '추천 말씀';
        ordered.push(video);
      }
    });
    videos.forEach((v) => {
      if (!ordered.some((o) => o.videoId === v.videoId)) ordered.push(v);
    });

    grid.innerHTML = ordered
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    const displayList = isMobile ? ordered.slice(0, 3) : ordered.slice(0, 15);

    grid.innerHTML = displayList
      .map((v, i) => {
        const posterUrl = `/api/sermon-poster/${encodeURIComponent(v.videoId)}?title=${encodeURIComponent(v.title || '')}&idx=${i}`;
        const badgeLabel = badges[i];
        return `
        <div class="sermon-card reveal reveal-delay-${(i % 6) + 1}" data-video-id="${escapeHtml(v.videoId)}" data-title="${escapeHtml(v.title || '')}">
          <div class="sermon-thumb">
            <img src="${posterUrl}" alt="${escapeHtml(v.title)}" loading="lazy" onerror="this.onerror=null;this.src='${escapeHtml(v.thumbnail)}';" />
            <button type="button" class="sermon-play" aria-label="재생">
              <svg viewBox="0 0 24 24"><path d="M9.5 7.5v9l8-4.5-8-4.5z"/></svg>
            </button>
          </div>
          ${badgeLabel ? `<div class="sermon-badge-bar">${escapeHtml(badgeLabel)}</div>` : ''}
        </div>`;
      })
      .join('');

    // 모바일 전용 "유튜브에서 전체 설교 보기" 링크 (채널이 연결되어 있을 때만 노출)
    const moreLink = $('#sermon-more-link');
    if (moreLink) {
      if (data.channelId) {
        moreLink.href = `https://www.youtube.com/channel/${encodeURIComponent(data.channelId)}/videos`;
        moreLink.style.display = ''; // CSS 미디어쿼리(모바일에서만 block)가 나머지를 처리
      } else {
        moreLink.style.display = 'none';
      }
    }
    observeReveals(grid);

    $$('.sermon-card').forEach((card) => {
      card.addEventListener('click', () => {
        track('click', {
          label: 'sermon_card',
          itemType: 'sermon',
          itemId: card.dataset.videoId,
          itemTitle: card.dataset.title
        });
        openVideoModal(card.dataset.videoId);
      });
    });

    setupCarouselNav(grid, 'sermon-nav-prev', 'sermon-nav-next');
  }

  // ---------------- 가로 캐러셀 공용 이전/다음 버튼 ----------------
  // 화면에 보이는 만큼(한 페이지)씩 옆으로 넘겨줍니다. 스크롤 끝에 도달하면
  // 해당 방향 버튼을 흐리게(비활성) 처리합니다.
  function setupCarouselNav(track, prevId, nextId) {
    const prevBtn = $('#' + prevId);
    const nextBtn = $('#' + nextId);
    if (!track || !prevBtn || !nextBtn) return;

    function updateNavState() {
      const maxScroll = track.scrollWidth - track.clientWidth;
      prevBtn.disabled = track.scrollLeft <= 4;
      nextBtn.disabled = track.scrollLeft >= maxScroll - 4;
    }

    prevBtn.onclick = () => track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
    nextBtn.onclick = () => track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });

    let scrollTimer = null;
    track.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(updateNavState, 80);
    });
    window.addEventListener('resize', updateNavState);
    updateNavState();
  }

  // ---------------- 찬양 ----------------
  let allPraises = [];
  let praiseCategoryList = [];
  let activePraiseCategory = null; // null이면 '전체'

  function renderPraiseCards(list) {
    const grid = $('#praise-grid');
    if (list.length === 0) {
      grid.innerHTML = `<p class="board-empty" style="padding:20px;">이 컨셉의 찬양이 아직 없어요.</p>`;
      return;
    }
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    const displayList = isMobile ? list.slice(0, 4) : list;
    grid.innerHTML = displayList
      .map(
        (p, i) => `
        <div class="praise-card reveal reveal-delay-${(i % 6) + 1}" data-video-id="${escapeHtml(p.youtubeId)}" data-title="${escapeHtml(p.title || '')}" style="--accent-rgb: ${accentForId(p.youtubeId)};">
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
        track('click', {
          label: 'praise_card',
          itemType: 'praise',
          itemId: card.dataset.videoId,
          itemTitle: card.dataset.title
        });
        openVideoModal(card.dataset.videoId);
      });
    });

    setupCarouselNav(grid, 'praise-nav-prev', 'praise-nav-next');
  }

  function renderPraiseCategoryChips() {
    const wrap = $('#praise-category-chips');
    const select = $('#praise-category-select');
    if (!wrap) return;
    // 곡이 하나라도 있는 컨셉만 필터로 보여줍니다 (텅 빈 필터 방지)
    const usedCategoryIds = new Set();
    allPraises.forEach((p) => (p.categoryIds || []).forEach((id) => usedCategoryIds.add(id)));
    const usable = praiseCategoryList.filter((c) => usedCategoryIds.has(c.id));

    if (usable.length === 0) {
      wrap.style.display = 'none';
      if (select) select.style.display = 'none';
      return;
    }
    wrap.style.display = '';
    const options = [{ id: null, name: '전체' }, ...usable];

    // PC: 옆으로 넘기는 칩 목록
    wrap.innerHTML = options
      .map(
        (c) => `<button type="button" class="praise-chip${activePraiseCategory === c.id ? ' active' : ''}" data-id="${c.id || ''}">${escapeHtml(c.name)}</button>`
      )
      .join('');
    $$('.praise-chip', wrap).forEach((chip) => {
      chip.addEventListener('click', () => applyPraiseCategoryFilter(chip.dataset.id || null, chip.textContent));
    });

    // 모바일: 옆으로 길게 늘어지는 칩 대신 한 줄짜리 드롭다운으로 대체
    if (select) {
      select.style.display = '';
      select.innerHTML = options.map((c) => `<option value="${c.id || ''}">${escapeHtml(c.name)}</option>`).join('');
      select.value = activePraiseCategory || '';
      select.onchange = () => {
        const chosen = options.find((c) => (c.id || '') === select.value);
        applyPraiseCategoryFilter(select.value || null, chosen ? chosen.name : '전체');
      };
    }
  }

  function applyPraiseCategoryFilter(categoryId, categoryName) {
    activePraiseCategory = categoryId;
    if (activePraiseCategory) {
      track('click', {
        label: 'praise_category_filter',
        itemType: 'praise_category',
        itemId: activePraiseCategory,
        itemTitle: categoryName
      });
    }
    $$('.praise-chip').forEach((c) => c.classList.toggle('active', (c.dataset.id || null) === categoryId));
    const select = $('#praise-category-select');
    if (select) select.value = categoryId || '';
    const filtered = activePraiseCategory
      ? allPraises.filter((p) => (p.categoryIds || []).includes(activePraiseCategory))
      : allPraises;
    renderPraiseCards(filtered);
  }

  async function loadPraises() {
    const [praises, categories] = await Promise.all([
      getJSON('/api/praises'),
      getJSON('/api/praise-categories')
    ]);
    allPraises = praises || [];
    praiseCategoryList = categories || [];
    const section = $('#praise');
    if (allPraises.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    renderPraiseCategoryChips();
    renderPraiseCards(allPraises);
  }

  // ---------------- 게시판 (소식·활동) ----------------
  let allPosts = [];

  function renderContent(content = '') {
    if (/<[a-z][\s\S]*>/i.test(content)) return content;
    return escapeHtml(content).replace(/\n/g, '<br>');
  }

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

  function thumbnailFor(post) {
    if (post.image) return post.image;
    const firstImg = (post.attachments || []).find(isImageAttachment);
    return firstImg ? firstImg.url : '';
  }

  const BOARD_MOBILE_LIMITS = { 소식: 3, 활동: 3, 주보: 1 };
  const BOARD_PAGE_SIZE = 9;
  const isBoardMobile = () => window.matchMedia('(max-width: 900px)').matches;

  let boardCategory = '전체';
  let boardPage = 1;

  const CATEGORY_LABELS = { 활동: '친교' };
  const categoryLabel = (cat) => CATEGORY_LABELS[cat] || cat;

  function boardCardHTML(p, i = 0) {
    const thumb = thumbnailFor(p);
    return `
      <div class="board-card reveal reveal-delay-${(i % 6) + 1}" data-id="${p.id}" data-title="${escapeHtml(p.title || '')}">
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

  function pickWithCategoryLimits(posts, limits) {
    const counts = {};
    const result = [];
    posts.forEach((p) => {
      const limit = limits[p.category];
      if (limit === undefined) return;
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
      if (category === '전체') {
        pageItems = pickWithCategoryLimits(allPosts, BOARD_MOBILE_LIMITS);
      } else {
        const limit = BOARD_MOBILE_LIMITS[category];
        pageItems = limit !== undefined ? byCategory.slice(0, limit) : byCategory;
      }
      totalForPagination = 0;
    } else {
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
        track('click', {
          label: 'board_card',
          itemType: 'board',
          itemId: item.dataset.id,
          itemTitle: item.dataset.title
        });
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

    // 본문 안에 있는 이미지들도 클릭하면 확대해서 볼 수 있게 합니다.
    $$('#post-modal-content img').forEach((img) => {
      img.addEventListener('click', () => openImageLightbox(img.src, ''));
    });

    const imgEl = $('#post-modal-image');
    if (post.image) {
      imgEl.src = post.image;
      imgEl.alt = post.title || '';
      imgEl.onclick = () => openImageLightbox(post.image, post.title || '');
    } else {
      imgEl.removeAttribute('src');
      imgEl.onclick = null;
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
    $$('#post-modal-attachments .attachment-image').forEach((img) => {
      img.addEventListener('click', () => openImageLightbox(img.src, img.alt || ''));
    });
    $$('#post-modal-attachments [data-preview="1"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        openFileModal(el.getAttribute('href'), el.dataset.name);
      });
    });

    $('#post-modal').classList.add('open');
    lockScroll();
  }

  function closePostModal() {
    $('#post-modal').classList.remove('open');
    unlockScroll();
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

  function createCoverflow(carousel, cardEls, initialIndex, { onChange } = {}) {
    const CARD_WIDTH = 340;
    const STEP = Math.round(CARD_WIDTH * 0.64);
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

    cardEls.forEach((card, i) => {
      card.addEventListener('click', (e) => {
        if (i !== activeIndex) {
          e.preventDefault();
          goTo(i);
        }
      });
    });

    let isDown = false;
    let dragged = false;
    let startX = 0;

    carousel.addEventListener('pointerdown', (e) => {
      isDown = true;
      dragged = false;
      startX = e.clientX;
      carousel.classList.add('dragging');
    });
    carousel.addEventListener('pointermove', (e) => {
      if (!isDown) return;
      if (!dragged && Math.abs(e.clientX - startX) > 15) {
        dragged = true;
        carousel.setPointerCapture(e.pointerId);
      }
    });
    const finishDrag = (e) => {
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

    const carouselPast = isDesktop ? rest.slice(0, 5).reverse() : [];

    const archiveCardHtml = (q) => `
      <a class="qt-card qt-card--archive" href="/qt/${q.id}" data-id="${q.id}" data-title="${escapeHtml(q.title || '')}">
        <span class="qt-badge qt-badge--archive">${formatQtDate(q.date)}</span>
        <h3 class="qt-card-title">${escapeHtml(q.title || '')}</h3>
        ${q.verseRef ? `<p class="qt-card-ref">${escapeHtml(q.verseRef)}</p>` : ''}
      </a>`;

    const todayCardHtml = `
      <a class="qt-card qt-card--today" href="/qt/${latest.id}" data-id="${latest.id}" data-title="${escapeHtml(latest.title || '')}">
        <span class="qt-badge">오늘의 큐티</span>
        <h3 class="qt-card-title">${escapeHtml(latest.title || '')}</h3>
        ${latest.verseRef ? `<p class="qt-card-ref">${escapeHtml(latest.verseRef)}</p>` : ''}
        <div class="qt-card-foot">
          <span>${escapeHtml(latest.pastor || '')}${latest.pastor ? ' · ' : ''}${formatQtDate(latest.date)}</span>
          <span>전체 보기 →</span>
        </div>
      </a>`;

    trackEl.innerHTML = carouselPast.map(archiveCardHtml).join('') + todayCardHtml;

    $$('#qt-carousel-track .qt-card--today').forEach((c) =>
      c.addEventListener('click', () =>
        track('click', { label: 'qt_card', itemType: 'qt', itemId: c.dataset.id, itemTitle: c.dataset.title })
      )
    );
    $$('#qt-carousel-track .qt-card--archive').forEach((c) =>
      c.addEventListener('click', () =>
        track('click', { label: 'qt_carousel_archive', itemType: 'qt', itemId: c.dataset.id, itemTitle: c.dataset.title })
      )
    );

    const todayIndex = carouselPast.length;

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
        <a class="qt-archive-row" href="/qt/${q.id}" data-id="${q.id}" data-title="${escapeHtml(q.title || '')}">
          <span class="date">${formatQtDate(q.date)}</span>
          <span class="title">${escapeHtml(q.title || '')}</span>
        </a>`
      )
      .join('');

    $$('.qt-archive-row').forEach((row) => {
      row.addEventListener('click', () =>
        track('click', { label: 'qt_archive_row', itemType: 'qt', itemId: row.dataset.id, itemTitle: row.dataset.title })
      );
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
            { type: 'Feature', geometry: { type: 'Point', coordinates: [127.8, 36.5] } },
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
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => setupPushPrompt(reg))
        .catch(() => {});
    });
  }

  // ---------------- 푸시 알림 구독 ----------------
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }

  async function setupPushPrompt(registration) {
    if (!('PushManager' in window) || !('Notification' in window)) return; // 미지원 기기(iOS 사파리 등)는 조용히 건너뜀
    if (Notification.permission === 'denied') return; // 이미 차단한 경우 다시 안 물어봄
    if (localStorage.getItem('push-prompt-dismissed') === '1') return; // 예전에 닫은 적 있으면 다시 안 보여줌

    const existing = await registration.pushManager.getSubscription();
    if (existing) return; // 이미 구독 중이면 배너 안 보여줌

    const banner = $('#push-prompt');
    if (!banner) return;
    banner.style.display = 'flex';

    $('#push-dismiss-btn').addEventListener('click', () => {
      banner.style.display = 'none';
      localStorage.setItem('push-prompt-dismissed', '1');
    });

    $('#push-allow-btn').addEventListener('click', async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          banner.style.display = 'none';
          return;
        }
        const { publicKey } = await getJSON('/api/push/vapid-public-key');
        if (!publicKey) {
          banner.style.display = 'none';
          return;
        }
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription)
        });
        banner.style.display = 'none';
        localStorage.setItem('push-prompt-dismissed', '1');
      } catch (err) {
        banner.style.display = 'none';
      }
    });
  }

  // ---------------- 초기 로드 ----------------
  observeReveals();
  // ---------------- 말씀 퀴즈 티저 카드 ----------------
  // 관리자가 이번 주 퀴즈를 등록해뒀을 때만 카드가 보이게 합니다. (없으면 빈 링크가
  // 보이지 않도록 기본은 숨김 상태로 시작해서, 있을 때만 드러냅니다)
  async function loadQuizTeaser() {
    const card = $('#quiz-teaser-card');
    if (!card) return;
    try {
      const res = await fetch('/api/quiz/current');
      const data = await res.json();
      if (data) {
        card.style.display = '';
        observeReveals(card.parentElement);
      }
    } catch (err) {
      // 실패해도 조용히 숨긴 채로 둡니다.
    }
  }

  Promise.all([loadSite(), loadMenu(), loadSermons(), loadPraises(), loadBoard(), loadQT(), loadMissions(), loadQuizTeaser()]).catch((err) => {
    console.error('콘텐츠를 불러오는 중 오류가 발생했습니다:', err);
  });
})();
