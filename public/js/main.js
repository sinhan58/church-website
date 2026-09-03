(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel, root = document) => Array.from((root || document).querySelectorAll(sel));

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

  // 관리자 페이지 리치 텍스트 에디터(Quill)에서 저장된 HTML을 안전하게 렌더링하기 위한
  // 화이트리스트 방식 정제 함수. 허용된 태그/속성만 남기고 나머지(script, on* 이벤트,
  // 위험한 style 속성 등)는 전부 제거합니다.
  const RICH_TEXT_ALLOWED_TAGS = new Set([
    'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SPAN', 'UL', 'OL', 'LI'
  ]);
  const RICH_TEXT_ALLOWED_STYLES = new Set(['text-align', 'font-size']);

  function sanitizeRichText(html = '') {
    const container = document.createElement('div');
    container.innerHTML = html;

    function clean(node) {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) return; // 텍스트 노드는 그대로 둠
        if (child.nodeType !== 1) {
          node.removeChild(child);
          return;
        }
        if (!RICH_TEXT_ALLOWED_TAGS.has(child.tagName)) {
          // 허용 안 된 태그(script, img, iframe 등)는 태그만 제거하고 내부 텍스트만 남김
          const text = document.createTextNode(child.textContent);
          node.replaceChild(text, child);
          return;
        }
        Array.from(child.attributes).forEach((attr) => {
          if (attr.name === 'style') {
            Array.from(child.style).forEach((prop) => {
              if (!RICH_TEXT_ALLOWED_STYLES.has(prop)) child.style.removeProperty(prop);
            });
          } else {
            child.removeAttribute(attr.name);
          }
        });
        clean(child);
      });
    }
    clean(container);
    return container.innerHTML;
  }

  // ---------------- 스크롤 등장 애니메이션 ----------------
  // 화면에 들어오면 나타나고, 화면 밖으로 나가면 사라졌다가, 다시 스크롤해서
  // 들어오면 또 나타나도록 반복합니다 (한 번 보고 나면 계속 그대로 두지 않음).
  // 단, 찬양 카드(.praise-card)와 게시판 카드(.board-card)는 화면 경계를 넘나들 때마다
  // 애니메이션이 재생되면서 스크롤 중 흔들리거나(찬양) 마지막 카드가 스르륵 사라지는
  // 것처럼 보이는 문제(게시판)가 있어, 한 번 나타난 뒤에는 고정합니다.
  const REVEAL_ONCE_CLASSES = ['praise-card', 'board-card', 'board-list', 'service-card'];
  const revealObserver =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              const isRevealOnce = REVEAL_ONCE_CLASSES.some((cls) => entry.target.classList.contains(cls));
              if (isRevealOnce) {
                if (entry.isIntersecting) {
                  entry.target.classList.add('is-visible');
                  revealObserver.unobserve(entry.target);
                }
                return;
              }
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

  let serviceAutoScrollStop = null;
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
      $('#about-body-text').innerHTML = sanitizeRichText(site.about.body || '');
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
    const serviceTimesList = site.serviceTimes || [];
    serviceGrid.innerHTML = serviceTimesList
      .map(
        (s, i) => `
        <div class="service-card reveal reveal-delay-${(i % 6) + 1}">
          <div class="service-card-shape"></div>
          <div class="service-card-content${s.bold ? ' is-bold' : ''} service-card-content--${s.fontSize || 'md'}">
            <div class="name">${escapeHtml(s.name)}</div>
            <div class="time">${escapeHtml(s.time)}</div>
            ${s.description ? `<div class="desc">${escapeHtml(s.description)}</div>` : ''}
          </div>
        </div>`
      )
      .join('');
    observeReveals(serviceGrid);
    applyServiceBackground(site.service);
    applyMinistryDuty(site.ministryDuty);
    sitePraiseConfig = site.praise;
    applyPraiseBackground(sitePraiseConfig);
    applySermonBackground(site.sermon);
    applyMissionsBackground(site.missionsBg);
    const setActiveServiceDot = setupServiceDots(serviceGrid, serviceTimesList.length);

    const isServiceMobile = window.matchMedia('(max-width: 900px)').matches;
    if (isServiceMobile) {
      // 모바일은 가로로 스와이프/자동 이동하는 구조라, 아래에서 위로 올라오는 페이드인 효과가
      // 같이 있으면 두 움직임이 겹쳐 어색해집니다. 모바일에서는 반응형 효과를 뺍니다.
      $$('.service-card', serviceGrid).forEach((card) => {
        card.classList.remove('reveal', 'reveal-delay-1', 'reveal-delay-2', 'reveal-delay-3', 'reveal-delay-4', 'reveal-delay-5', 'reveal-delay-6');
      });
    }

    if (serviceAutoScrollStop) {
      serviceAutoScrollStop();
      serviceAutoScrollStop = null;
    }
    if (isServiceMobile && serviceTimesList.length > 1) {
      const buildCardHTML = (s) => `
        <div class="service-card">
          <div class="service-card-shape"></div>
          <div class="service-card-content${s.bold ? ' is-bold' : ''} service-card-content--${s.fontSize || 'md'}">
            <div class="name">${escapeHtml(s.name)}</div>
            <div class="time">${escapeHtml(s.time)}</div>
            ${s.description ? `<div class="desc">${escapeHtml(s.description)}</div>` : ''}
          </div>
        </div>`;
      const sLast = serviceTimesList[serviceTimesList.length - 1];
      const lastCloneWrap = document.createElement('div');
      lastCloneWrap.innerHTML = buildCardHTML(sLast);
      serviceGrid.insertBefore(lastCloneWrap.firstElementChild, serviceGrid.firstChild);

      const s0 = serviceTimesList[0];
      const firstCloneWrap = document.createElement('div');
      firstCloneWrap.innerHTML = buildCardHTML(s0);
      serviceGrid.appendChild(firstCloneWrap.firstElementChild);

      serviceAutoScrollStop = setupInfiniteAutoScroll(serviceGrid, serviceTimesList.length, 3000, setActiveServiceDot);
    }

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

  // ---------------- 찬양 미니 플레이어 (유튜브 IFrame Player API) ----------------
  let ytApiLoadingPromise = null;
  let ytPlayer = null;
  let miniPlaylist = [];
  let miniIndex = -1;

  function loadYouTubeIframeAPI() {
    if (ytApiLoadingPromise) return ytApiLoadingPromise;
    ytApiLoadingPromise = new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        resolve();
        return;
      }
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevCallback === 'function') prevCallback();
        resolve();
      };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    });
    return ytApiLoadingPromise;
  }

  function setMiniPlayerPlayingIcon(isPlaying) {
    const playIcon = $('#mini-player-play-icon');
    const pauseIcon = $('#mini-player-pause-icon');
    if (!playIcon || !pauseIcon) return;
    playIcon.style.display = isPlaying ? 'none' : '';
    pauseIcon.style.display = isPlaying ? '' : 'none';
  }

  function updateMiniPlayerUI() {
    const item = miniPlaylist[miniIndex];
    const titleEl = $('#mini-player-title');
    if (item && titleEl) titleEl.textContent = item.title || '';
  }

  async function playInMiniPlayer(list, index) {
    const bar = $('#mini-player');
    if (!bar) return;
    miniPlaylist = list;
    miniIndex = index;
    const item = miniPlaylist[miniIndex];
    if (!item) return;

    bar.style.display = 'flex';
    document.body.classList.add('has-mini-player');
    updateMiniPlayerUI();

    track('click', {
      label: 'praise_mini_player',
      itemType: 'praise',
      itemId: item.youtubeId,
      itemTitle: item.title || ''
    });

    await loadYouTubeIframeAPI();

    if (!ytPlayer) {
      ytPlayer = new YT.Player('mini-player-yt-mount', {
        videoId: item.youtubeId,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: () => setMiniPlayerPlayingIcon(true),
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) setMiniPlayerPlayingIcon(true);
            if (e.data === YT.PlayerState.PAUSED) setMiniPlayerPlayingIcon(false);
            if (e.data === YT.PlayerState.ENDED) playNextInMiniPlayer();
          }
        }
      });
    } else {
      ytPlayer.loadVideoById(item.youtubeId);
    }
  }

  function playNextInMiniPlayer() {
    if (miniIndex < miniPlaylist.length - 1) {
      playInMiniPlayer(miniPlaylist, miniIndex + 1);
    } else if (ytPlayer && ytPlayer.stopVideo) {
      // 재생목록의 마지막 곡까지 끝나면 정지 (처음으로 되돌아가 자동 반복하지 않음)
      ytPlayer.stopVideo();
      setMiniPlayerPlayingIcon(false);
    }
  }
  function playPrevInMiniPlayer() {
    if (miniIndex > 0) playInMiniPlayer(miniPlaylist, miniIndex - 1);
  }
  function toggleMiniPlayerPlayPause() {
    if (!ytPlayer || !window.YT) return;
    const state = ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
  }
  function closeMiniPlayer() {
    if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
    const bar = $('#mini-player');
    const icon = $('#mini-player-expand-icon');
    if (bar) {
      bar.style.display = 'none';
      bar.classList.remove('is-expanded');
    }
    if (icon) icon.style.transform = '';
    document.body.classList.remove('has-mini-player');
  }
  function toggleMiniPlayerExpand() {
    const bar = $('#mini-player');
    const icon = $('#mini-player-expand-icon');
    if (!bar) return;
    const isExpanded = bar.classList.toggle('is-expanded');
    if (icon) icon.style.transform = isExpanded ? 'rotate(180deg)' : '';
  }

  if ($('#mini-player-prev')) $('#mini-player-prev').addEventListener('click', playPrevInMiniPlayer);
  if ($('#mini-player-next')) $('#mini-player-next').addEventListener('click', playNextInMiniPlayer);
  if ($('#mini-player-playpause')) $('#mini-player-playpause').addEventListener('click', toggleMiniPlayerPlayPause);
  if ($('#mini-player-close')) $('#mini-player-close').addEventListener('click', closeMiniPlayer);
  if ($('#mini-player-video')) {
    $('#mini-player-video').addEventListener('click', toggleMiniPlayerExpand);
  }
  if ($('#mini-player-expand')) $('#mini-player-expand').addEventListener('click', toggleMiniPlayerExpand);

  // ---------------- 섬김 안내 모달 열기/닫기 ----------------
  if ($('#ministry-duty-fab')) {
    $('#ministry-duty-fab').addEventListener('click', () => {
      $('#ministry-duty-modal').classList.add('open');
    });
  }
  if ($('#ministry-duty-modal-close')) {
    $('#ministry-duty-modal-close').addEventListener('click', () => {
      $('#ministry-duty-modal').classList.remove('open');
    });
  }
  if ($('#ministry-duty-modal')) {
    $('#ministry-duty-modal').addEventListener('click', (e) => {
      if (e.target.id === 'ministry-duty-modal') $('#ministry-duty-modal').classList.remove('open');
    });
  }

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

  let allSermonVideos = [];
  let sermonCategoryList = [];
  let sermonCategoryTags = {};
  let activeSermonCategory = null; // null이면 '전체'
  let sermonChannelId = null;

  let sermonSiteInfo = { churchName: '', pastorName: '' };

  async function loadSermons() {
    const [data, categories, tags, site] = await Promise.all([
      getJSON('/api/sermons'),
      getJSON('/api/sermon-categories'),
      getJSON('/api/sermon-category-tags'),
      getJSON('/api/site')
    ]);
    const updated = $('#sermon-updated');

    updated.textContent = data.lastUpdated
      ? `마지막 업데이트: ${formatDate(data.lastUpdated)}`
      : '';

    allSermonVideos = data.videos || [];
    sermonCategoryList = categories || [];
    sermonCategoryTags = tags || {};
    sermonChannelId = data.channelId || null;
    sermonSiteInfo = {
      churchName: (site && site.churchName) || '',
      pastorName: (site && site.about && site.about.pastorName) || ''
    };

    const moreRow = $('#sermon-more-row');
    if (moreRow) {
      if (sermonChannelId) {
        moreRow.href = `https://www.youtube.com/channel/${encodeURIComponent(sermonChannelId)}/videos`;
        moreRow.style.display = 'flex';
      } else {
        moreRow.style.display = 'none';
      }
    }

    if (allSermonVideos.length === 0) {
      $('#sermon-hero-card').innerHTML = '';
      $('#sermon-list').innerHTML = `<div class="sermon-empty">아직 등록된 설교 영상이 없습니다. 관리자 페이지에서 유튜브 채널을 연결해주세요.</div>`;
      return;
    }

    renderSermonCategoryChips();
    renderSermonHero();
    renderSermonList();
    requestAnimationFrame(syncSermonHeroHeight);
  }

  function renderSermonCategoryChips() {
    const wrap = $('#sermon-category-chips');
    if (!wrap) return;
    const knownVideoIds = new Set(allSermonVideos.map((v) => v.videoId));
    const usedIds = new Set();
    Object.entries(sermonCategoryTags).forEach(([videoId, ids]) => {
      if (!knownVideoIds.has(videoId)) return; // 실제 영상 데이터가 없는(완전히 사라진) 태그는 무시
      (ids || []).forEach((id) => usedIds.add(id));
    });
    const usable = sermonCategoryList.filter((c) => usedIds.has(c.id));

    if (usable.length === 0) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = '';
    const options = [{ id: null, name: '전체' }, ...usable];
    wrap.innerHTML = options
      .map(
        (c) => `<button type="button" class="praise-chip${activeSermonCategory === c.id ? ' active' : ''}" data-id="${c.id || ''}">${escapeHtml(c.name)}</button>`
      )
      .join('');
    $$('.praise-chip', wrap).forEach((chip) => {
      chip.addEventListener('click', () => {
        activeSermonCategory = chip.dataset.id || null;
        if (activeSermonCategory) {
          track('click', {
            label: 'sermon_category_filter',
            itemType: 'sermon_category',
            itemId: activeSermonCategory,
            itemTitle: chip.textContent
          });
        }
        $$('.praise-chip', wrap).forEach((c) => c.classList.toggle('active', c === chip));
        renderSermonHero();
        renderSermonList();
        requestAnimationFrame(syncSermonHeroHeight);
      });
    });
  }

  // 히어로 자리: 필터가 없으면 전체 중 최신 1개, 필터가 있으면 그 테마 중 최신 1개.
  function currentHeroVideo() {
    const pool = activeSermonCategory
      ? allSermonVideos.filter((v) => (sermonCategoryTags[v.videoId] || []).includes(activeSermonCategory))
      : allSermonVideos;
    return pool[0] || null;
  }

  function renderSermonHero() {
    const card = $('#sermon-hero-card');
    const hero = currentHeroVideo();
    if (!hero) {
      card.innerHTML = `<div class="sermon-empty" style="height:100%; display:flex; align-items:center; justify-content:center;">이 테마의 설교가 아직 없어요.</div>`;
      return;
    }
    const posterUrl = `/api/sermon-poster/${encodeURIComponent(hero.videoId)}?title=${encodeURIComponent(hero.title || '')}`;
    card.innerHTML = `
      <img src="${posterUrl}" alt="${escapeHtml(hero.title || '')}" onerror="this.onerror=null;this.src='${escapeHtml(hero.thumbnail)}';" />
      <div class="sermon-hero-label">주일 예배 설교</div>
      <span class="sermon-hero-play" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 7.5v9l8-4.5-8-4.5z"/></svg>
      </span>
      <div class="sermon-hero-band">MULDAEN DONGSAN CHURCH</div>`;
    card.dataset.videoId = hero.videoId;
    card.onclick = () => {
      track('click', {
        label: 'sermon_hero',
        itemType: 'sermon',
        itemId: hero.videoId,
        itemTitle: hero.title || ''
      });
      openVideoModal(hero.videoId);
    };
  }

  // 메인 설교(사진) 카드 높이를 지난 설교 목록 카드의 실제 렌더링 높이에 정확히 맞춥니다.
  // (PC에서만: 모바일은 세로로 쌓이는 구조라 서로 높이를 맞출 필요가 없음)
  function syncSermonHeroHeight() {
    const heroCard = $('#sermon-hero-card');
    const listWrap = $('.sermon-list-wrap');
    if (!heroCard || !listWrap) return;
    if (window.matchMedia('(max-width: 900px)').matches) {
      heroCard.style.height = ''; // 모바일에서는 CSS(aspect-ratio)에 맡김
      return;
    }
    const listHeight = listWrap.getBoundingClientRect().height;
    if (listHeight > 0) heroCard.style.height = `${listHeight}px`;
  }
  let sermonHeroHeightSyncTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(sermonHeroHeightSyncTimer);
    sermonHeroHeightSyncTimer = setTimeout(syncSermonHeroHeight, 150);
  });

  function renderSermonList() {
    const listEl = $('#sermon-list');

    const heroId = currentHeroVideo() ? currentHeroVideo().videoId : null;
    let pool = activeSermonCategory
      ? allSermonVideos.filter((v) => (sermonCategoryTags[v.videoId] || []).includes(activeSermonCategory))
      : allSermonVideos.slice();

    // 히어로로 이미 쓰인 영상은 목록에서 중복으로 안 보이게 뺍니다.
    pool = pool.filter((v) => v.videoId !== heroId);

    if (!activeSermonCategory) {
      // '전체'일 때: 테마가 하나라도 붙은 영상을 위로, 그다음 나머지 최신순.
      const tagged = pool.filter((v) => (sermonCategoryTags[v.videoId] || []).length > 0);
      const untagged = pool.filter((v) => (sermonCategoryTags[v.videoId] || []).length === 0);
      pool = [...tagged, ...untagged];
    }

    if (pool.length === 0) {
      listEl.innerHTML = `<p class="sermon-empty">더 보여드릴 지난 설교가 없어요.</p>`;
      return;
    }

    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    const displayList = pool.slice(0, isMobile ? 3 : 4);
    const categoryNameById = {};
    sermonCategoryList.forEach((c) => (categoryNameById[c.id] = c.name));

    listEl.innerHTML = displayList
      .map((v) => {
        const { verseRef, title } = parseSermonTitleClient(v.title || '');
        const tagIds = sermonCategoryTags[v.videoId] || [];
        const badgesHtml = tagIds
          .map((id) => (categoryNameById[id] ? `<span class="theme-badge">${escapeHtml(categoryNameById[id])}</span>` : ''))
          .join('');
        return `
        <a href="#" class="sermon-list-row" data-video-id="${escapeHtml(v.videoId)}" data-title="${escapeHtml(v.title || '')}">
          ${badgesHtml ? `<span class="badges">${badgesHtml}</span>` : ''}
          <p class="title"><span class="bullet">•</span><span class="text">${escapeHtml(title || v.title || '')}</span></p>
          ${verseRef ? `<p class="verse">${escapeHtml(verseRef)}</p>` : ''}
        </a>`;
      })
      .join('');

    $$('.sermon-list-row', listEl).forEach((row) => {
      row.addEventListener('click', (e) => {
        e.preventDefault();
        track('click', {
          label: 'sermon_list_row',
          itemType: 'sermon',
          itemId: row.dataset.videoId,
          itemTitle: row.dataset.title
        });
        openVideoModal(row.dataset.videoId);
      });
    });
  }

  // 서버의 parseSermonTitle과 동일한 규칙으로, 목록 표시용 제목/구절을 클라이언트에서도 뽑아냅니다.
  function parseSermonTitleClient(raw = '') {
    let t = raw.replace(/주일예배/g, '');
    t = t.replace(/\b\d{8}\b/g, '').trim().replace(/^[-_·\s]+|[-_·\s]+$/g, '');
    t = t.replace(/\s{2,}/g, ' '); // 단어를 지우면서 남는 이중 띄어쓰기 정리
    const m = t.match(/^([가-힣]+\s?\d+장\s?\d+(?:[~\-]\d+)?절(?:,\s?\d+(?:[~\-]\d+)?절)*)\s*(.*)$/);
    if (m) return { verseRef: m[1].trim(), title: m[2].trim() || t };
    return { verseRef: '', title: t };
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
  let sitePraiseConfig = null;
  let praiseCategoryList = [];
  let activePraiseCategory = null; // null이면 '전체'

  function renderPraiseCards(list) {
    const grid = $('#praise-grid');
    if (list.length === 0) {
      grid.innerHTML = `<p class="board-empty" style="padding:20px;">이 컨셉의 찬양이 아직 없어요.</p>`;
      return;
    }
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    const displayList = isMobile ? list.slice(0, 45) : list;
    grid.innerHTML = displayList
      .map(
        (p, i) => `
        <div class="praise-card reveal reveal-delay-${(i % 6) + 1}" data-video-id="${escapeHtml(p.youtubeId)}" data-title="${escapeHtml(p.title || '')}" style="--accent-rgb: ${accentForId(p.youtubeId)};">
          <div class="praise-thumb">
            <img src="https://i.ytimg.com/vi/${escapeHtml(p.youtubeId)}/mqdefault.jpg" alt="${escapeHtml(p.title)}" loading="lazy" />
            <button type="button" class="praise-play" aria-label="재생">
              <svg viewBox="0 0 24 24"><path d="M9.5 7.5v9l8-4.5-8-4.5z"/></svg>
            </button>
            <div class="praise-overlay-text">
              <p class="title">${escapeHtml(p.title)}</p>
              ${p.singer ? `<p class="singer">${escapeHtml(p.singer)}</p>` : ''}
            </div>
          </div>
          <p class="praise-tile-title">${escapeHtml(p.title || '')}</p>
        </div>`
      )
      .join('');
    observeReveals(grid);

    $$('.praise-card', grid).forEach((card, i) => {
      card.addEventListener('click', () => {
        playInMiniPlayer(
          displayList.map((p) => ({ youtubeId: p.youtubeId, title: p.title || '' })),
          i
        );
      });
    });

    setupCarouselNav(grid, 'praise-nav-prev', 'praise-nav-next');
    setupScrollProgressBar(grid, 'praise-scroll-track', 'praise-scroll-thumb');
    setupPraiseDots(grid, displayList.length);
  }

  // 가로 스크롤이 얼마나 남았는지, 얇은 막대로 보여줍니다 (세로 스크롤바처럼 은은하게).
  function setupScrollProgressBar(scrollEl, trackId, thumbId) {
    const track = $('#' + trackId);
    const thumb = $('#' + thumbId);
    if (!track || !thumb) return;

    function update() {
      const scrollable = scrollEl.scrollWidth - scrollEl.clientWidth;
      if (scrollable <= 0) {
        track.style.display = 'none';
        return;
      }
      track.style.display = '';
      const trackWidth = track.clientWidth;
      const thumbRatio = Math.min(1, scrollEl.clientWidth / scrollEl.scrollWidth);
      const thumbWidth = Math.max(24, trackWidth * thumbRatio);
      const maxThumbTravel = trackWidth - thumbWidth;
      const progress = scrollEl.scrollLeft / scrollable;
      thumb.style.width = thumbWidth + 'px';
      thumb.style.transform = `translateX(${progress * maxThumbTravel}px)`;
    }

    // 같은 요소에 스크롤 리스너가 중복으로 쌓이지 않도록, 매번 새로 붙이기 전에 이전 걸 떼어냅니다.
    if (scrollEl._scrollProgressHandler) {
      scrollEl.removeEventListener('scroll', scrollEl._scrollProgressHandler);
    }
    scrollEl._scrollProgressHandler = update;
    scrollEl.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    requestAnimationFrame(update);
  }

  // 페이지 세로 스크롤에 영향을 주지 않도록, 다이얼 안에서만 가로로 이동시킵니다.
  function centerCellInDial(dial, cell, smooth) {
    if (!dial || !cell) return;
    const targetLeft = cell.offsetLeft - dial.clientWidth / 2 + cell.offsetWidth / 2;
    if (smooth && dial.scrollTo) {
      dial.scrollTo({ left: targetLeft, behavior: 'smooth' });
    } else {
      dial.scrollLeft = targetLeft;
    }
  }

  function renderPraiseCategoryChips() {
    const wrap = $('#praise-category-chips');
    const dialWrap = $('#praise-theme-dial-wrap');
    const dial = $('#praise-theme-dial');
    if (!wrap) return;
    // 곡이 하나라도 있는 컨셉만 필터로 보여줍니다 (텅 빈 필터 방지)
    const usedCategoryIds = new Set();
    allPraises.forEach((p) => (p.categoryIds || []).forEach((id) => usedCategoryIds.add(id)));
    const usable = praiseCategoryList.filter((c) => usedCategoryIds.has(c.id));

    if (usable.length === 0) {
      wrap.style.display = 'none';
      if (dialWrap) dialWrap.style.display = 'none';
      return;
    }
    wrap.style.display = '';
    const options = [{ id: null, name: '모든 찬양' }, ...usable];

    // PC: 옆으로 넘기는 칩 목록
    wrap.innerHTML = options
      .map(
        (c) => `<button type="button" class="praise-chip${activePraiseCategory === c.id ? ' active' : ''}" data-id="${c.id || ''}">${escapeHtml(c.name)}</button>`
      )
      .join('');
    $$('.praise-chip', wrap).forEach((chip) => {
      chip.addEventListener('click', () => applyPraiseCategoryFilter(chip.dataset.id || null, chip.textContent));
    });

    // 모바일: 아이폰 피커처럼, 돌리다가 가운데에 딱 맞는 순간 자동으로 선택됩니다.
    if (dial) {
      dialWrap.style.display = '';
      dial.innerHTML = options
        .map(
          (c, i) => `<span class="praise-theme-cell${activePraiseCategory === c.id ? ' is-active' : ''}" data-id="${c.id || ''}" data-index="${i}">${escapeHtml(c.name)}</span>`
        )
        .join('');
      setupPraiseThemeDial(dial, options);
    }
  }

  // 스크롤이 멈출 때마다(빙글빙글 도는 도중이 아니라 딱 멈춘 순간), 화면 정가운데에
  // 가장 가까운 테마를 찾아서 자동으로 선택합니다. 탭이 따로 필요 없습니다.
  function setupPraiseThemeDial(dial, options) {
    let settleTimer = null;

    function findCenteredCell() {
      const dialRect = dial.getBoundingClientRect();
      const centerX = dialRect.left + dialRect.width / 2;
      let closest = null;
      let closestDist = Infinity;
      $$('.praise-theme-cell', dial).forEach((cell) => {
        const r = cell.getBoundingClientRect();
        const cellCenter = r.left + r.width / 2;
        const dist = Math.abs(cellCenter - centerX);
        if (dist < closestDist) {
          closestDist = dist;
          closest = cell;
        }
      });
      return closest;
    }

    function highlightOnly(cell) {
      $$('.praise-theme-cell', dial).forEach((c) => c.classList.toggle('is-active', c === cell));
    }

    function onSettle() {
      const cell = findCenteredCell();
      if (!cell) return;
      highlightOnly(cell);
      const id = cell.dataset.id || null;
      if (id !== activePraiseCategory) {
        const opt = options[Number(cell.dataset.index)];
        applyPraiseCategoryFilterFromDial(id, opt ? opt.name : '모든 찬양');
      }
    }

    // 스크롤 도중엔 하이라이트만 실시간으로 옮겨주고(뭐가 가운데 올지 미리 보여줌),
    // 실제 필터 적용은 스크롤이 완전히 멈췄을 때 한 번만 합니다.
    dial.addEventListener('scroll', () => {
      const cell = findCenteredCell();
      if (cell) highlightOnly(cell);
      clearTimeout(settleTimer);
      settleTimer = setTimeout(onSettle, 120);
    });

    // 처음 진입 시, 현재 선택된 테마(또는 '전체')를 가운데로 맞춰둡니다.
    // (scrollIntoView는 페이지 전체를 세로로도 끌어당기는 부작용이 있어 쓰지 않고,
    // 다이얼 안에서만 scrollLeft를 직접 계산해서 옮깁니다)
    requestAnimationFrame(() => {
      const target = $(`.praise-theme-cell[data-id="${activePraiseCategory || ''}"]`, dial);
      centerCellInDial(dial, target, false);
    });
  }

  // 다이얼에서 선택되면(탭 없이) 칩·필터를 함께 동기화합니다.
  function applyPraiseCategoryFilterFromDial(categoryId, categoryName) {
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
    const filtered = activePraiseCategory
      ? allPraises.filter((p) => (p.categoryIds || []).includes(activePraiseCategory))
      : allPraises;
    renderPraiseCards(filtered);
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
    const dial = $('#praise-theme-dial');
    if (dial) {
      const target = $(`.praise-theme-cell[data-id="${categoryId || ''}"]`, dial);
      if (target) {
        $$('.praise-theme-cell', dial).forEach((c) => c.classList.toggle('is-active', c === target));
        centerCellInDial(dial, target, true);
      }
    }
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
    applyPraiseBackground(sitePraiseConfig);
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

  // ---------------- 예배 안내 배경 사진 ----------------
  // object-fit:cover 상태(줌 100%)에서 이미 화면을 꽉 채우고 있기 때문에, 그 상태에서
  // 초점 좌표를 기준으로 transform: scale()만 키워주면 어떤 배율에서도 빈 공간 없이
  // 항상 그 지점을 중심으로 확대됩니다.
  function applySectionBackground(sectionSelector, imgSelector, overlaySelector, cfg) {
    const section = $(sectionSelector);
    const img = $(imgSelector);
    const overlay = $(overlaySelector);
    if (!section || !img || !overlay) return;
    if (cfg && cfg.backgroundImage) {
      const focalX = cfg.focalX != null ? cfg.focalX : 50;
      const focalY = cfg.focalY != null ? cfg.focalY : 50;
      const zoom = cfg.zoom || 100;
      img.src = cfg.backgroundImage;
      img.style.objectPosition = `${focalX}% ${focalY}%`;
      img.style.transformOrigin = `${focalX}% ${focalY}%`;
      img.style.transform = `scale(${zoom / 100})`;
      img.classList.add('is-visible');
      overlay.classList.add('is-visible');
      section.classList.add('has-bg-photo');
    } else {
      img.removeAttribute('src');
      img.classList.remove('is-visible');
      overlay.classList.remove('is-visible');
      section.classList.remove('has-bg-photo');
    }
  }
  function applyServiceBackground(svc) {
    applySectionBackground('#service', '#service-bg-img', '.service-bg-overlay', svc);
  }
  function applyPraiseBackground(cfg) {
    applySectionBackground('#praise', '#praise-bg-img', '.praise-bg-overlay', cfg);
  }
  function applySermonBackground(cfg) {
    applySectionBackground('#sermons', '#sermon-bg-img', '.sermon-bg-overlay', cfg);
  }
  function applyMissionsBackground(cfg) {
    applySectionBackground('#missions', '#missions-bg-img', '.missions-bg-overlay', cfg);
  }

  // ---------------- 섬김 안내 (예배 위원 / 식사 봉사) ----------------
  function applyMinistryDuty(duty) {
    const fab = $('#ministry-duty-fab');
    const worshipEl = $('#ministry-duty-worship');
    const mealEl = $('#ministry-duty-meal');
    if (!fab) return;
    const worship = (duty && duty.worship) || '';
    const meal = (duty && duty.meal) || '';
    if (!worship && !meal) {
      fab.style.display = 'none';
      return;
    }
    const titleEl = $('#ministry-duty-title');
    const worshipLabelEl = $('#ministry-duty-worship-label');
    const mealLabelEl = $('#ministry-duty-meal-label');
    if (titleEl) titleEl.textContent = (duty && duty.title) || '이번 주 섬김 안내';
    if (worshipLabelEl) worshipLabelEl.textContent = (duty && duty.worshipLabel) || '예배 위원';
    if (mealLabelEl) mealLabelEl.textContent = (duty && duty.mealLabel) || '주일 식사 봉사 당번';
    if (worshipEl) worshipEl.textContent = worship || '등록된 내용이 없습니다.';
    if (mealEl) mealEl.textContent = meal || '등록된 내용이 없습니다.';
    fab.style.display = ''; // 인라인 display:none 해제 → CSS(모바일 전용 flex)가 적용됨
  }

  // 모바일에서 카드를 스와이프할 때, 화면 중앙에 가장 가까운 카드에 맞춰 점을 켜줍니다
  // 가로 스와이프 캐러셀이 마지막 카드에서 처음으로 돌아갈 때, 역방향으로 튕기지 않고
  // 같은 방향으로 계속 넘어가는 것처럼 보이게 합니다. (첫 카드를 맨 뒤에 하나 복제해두고,
  // 그 복제본까지 도착하면 애니메이션 없이 진짜 첫 카드 위치로 순간 이동합니다.)
  // row 안에는 [마지막 카드 복제본, 실제 카드 1~N, 첫 카드 복제본] 순서로 들어있어야 합니다.
  // (호출하는 쪽에서 이렇게 구성해줍니다.) 그래야 자동 넘김과 손가락 스와이프 둘 다
  // 양쪽 방향으로 끝없이 순환하는 것처럼 보입니다.
  function setupInfiniteAutoScroll(row, itemCount, intervalMs, onPosChange) {
    if (!row || itemCount <= 1) return () => {};
    let pos = 1; // 1..itemCount = 실제 카드, 0 = 마지막 복제본, itemCount+1 = 첫 복제본
    let tickTimer = null;
    let settleTimer = null;
    let waitingForSettle = false;
    let destroyed = false;
    let animating = false; // 제 코드가 만든 애니메이션이 지금 진행 중인지

    function notifyPos() {
      if (onPosChange) onPosChange(pos - 1); // 0-based 실제 카드 인덱스로 알려줌
    }

    function finishAnimating() {
      // scrollLeft를 직접 바꾼 직후엔 브라우저가 'scroll' 이벤트를 살짝 늦게(비동기로) 보내는데,
      // 그 이벤트가 뒤늦게 도착했을 때도 여전히 "내가 한 것"으로 인식되도록 짧은 유예를 둡니다.
      setTimeout(() => {
        animating = false;
      }, 60);
    }

    function easeInOutQuad(t) {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    let animGen = 0; // 애니메이션 세대 번호 — 새 애니메이션이 시작되면 이전 애니메이션은 스스로 멈춥니다.
    function animateScrollTo(targetLeft, duration, done) {
      const myGen = ++animGen;
      const startLeft = row.scrollLeft;
      const distance = targetLeft - startLeft;
      const startTime = performance.now();
      function step(now) {
        if (destroyed || myGen !== animGen) return; // 더 최신 애니메이션에 밀렸으면 즉시 멈춤
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        row.scrollLeft = startLeft + distance * easeInOutQuad(t);
        if (t < 1) {
          requestAnimationFrame(step);
        } else if (done) {
          done();
        }
      }
      requestAnimationFrame(step);
    }

    // 복제본 자리에 도착했으면, 애니메이션 없이 즉시 진짜 카드 자리로 순간 이동합니다.
    // (복제본과 내용이 똑같아서 티가 안 남)
    function correctIfOnClone() {
      const pageWidth = row.clientWidth || 1;
      if (pos === itemCount + 1) {
        row.scrollLeft = 1 * pageWidth;
        pos = 1;
        notifyPos();
      } else if (pos === 0) {
        row.scrollLeft = itemCount * pageWidth;
        pos = itemCount;
        notifyPos();
      }
    }

    function scheduleNext() {
      if (tickTimer) clearTimeout(tickTimer);
      if (!destroyed) tickTimer = setTimeout(goNext, intervalMs);
    }

    function goNext() {
      if (destroyed || animating) return;
      animating = true;
      const pageWidth = row.clientWidth || 1;
      pos += 1;
      // 마지막→첫번째(또는 그 반대)로 넘어가는 슬라이드라면, 애니메이션이 끝난 뒤가 아니라
      // "지금 이 슬라이드가 시작되는 순간"부터 점을 미리 업데이트합니다. 그래야 슬라이드가
      // 진행되는 0.5초 내내 점이 카드와 같이 움직이는 것처럼 느껴지고, 슬라이드가 다 끝난
      // 뒤에야 점이 뒤늦게 딸깍 바뀌는 "분리된 느낌"이 없어집니다.
      if (pos === itemCount + 1) {
        if (onPosChange) onPosChange(0);
      } else if (pos === 0) {
        if (onPosChange) onPosChange(itemCount - 1);
      } else {
        notifyPos();
      }
      row.style.scrollSnapType = 'none'; // 이 애니메이션이 진행되는 짧은 순간만 스냅과 충돌하지 않도록 잠시 꺼둠
      animateScrollTo(pos * pageWidth, 500, () => {
        if (destroyed) return;
        correctIfOnClone(); // animating이 아직 true인 상태에서 처리 — 이 안에서 생기는 scrollLeft 변화도 "내가 한 것"으로 인식되게
        finishAnimating();
        row.style.scrollSnapType = ''; // 다 움직였으니 바로 복구
        scheduleNext();
      });
    }

    // 터치/포인터 제스처를 직접 해석하려 하지 않고, "실제 스크롤 위치가 지금 움직이고
    // 있는가"만 그대로 관찰합니다. 스크롤이 멈추면(150ms 동안 추가 변화 없음) 그 시점의
    // 실제 위치를 기준으로 다시 맞추고 다음 자동 넘김을 예약합니다. 이 방식은 손가락으로
    // 얼마나 빠르게 여러 번 연속으로 넘기든, 세로로 스크롤하든(이 요소 자체의 가로 스크롤
    // 위치는 안 바뀌므로 애초에 이 리스너가 반응하지 않음) 항상 실제 상태와 어긋나지 않습니다.
    row.addEventListener(
      'scroll',
      () => {
        if (animating) return; // 제 코드가 만든 스크롤이면 무시 (goNext 쪽에서 알아서 처리)
        if (tickTimer) {
          clearTimeout(tickTimer);
          tickTimer = null;
        }
        if (waitingForSettle) return; // 이미 "정착 감지"를 걸어둔 상태면 중복으로 또 걸지 않음
        waitingForSettle = true;
        const onSettle = () => {
          waitingForSettle = false;
          settleTimer = null;
          if (destroyed) return;
          const pageWidth = row.clientWidth || 1;
          pos = Math.round(row.scrollLeft / pageWidth);
          animating = true; // correctIfOnClone()이 만드는 scrollLeft 변화도 "내가 한 것"으로 인식되게
          correctIfOnClone();
          finishAnimating();
          notifyPos();
          scheduleNext();
        };
        if ('onscrollend' in window) {
          // scrollend는 "지금 이 스와이프"가 실제로 멈추는 시점에 정확히 한 번 울립니다.
          // 연속으로 빠르게 여러 번 스와이프해도, 스와이프 하나하나가 끝날 때마다 바로
          // 보정되어서 다음 스와이프가 항상 정상적으로 이어집니다.
          row.addEventListener('scrollend', onSettle, { once: true });
        } else {
          settleTimer = setTimeout(onSettle, 150);
        }
      },
      { passive: true }
    );

    // 폰트 로딩 등으로 레이아웃이 아직 다 안 잡힌 상태에서 카드 폭을 재면 계산이 어긋날 수
    // 있어서, 레이아웃이 확실히 자리잡은 다음(폰트 로딩 완료 + 한 프레임 더) 시작합니다.
    function begin() {
      // 시작 위치를 진짜 첫 카드(1번)로 맞춰둡니다 (0번은 복제본이라서요).
      row.scrollLeft = row.clientWidth || 0;
      scheduleNext();
    }
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fontsReady.then(() => {
      if (destroyed) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!destroyed) begin();
        });
      });
    });

    return function destroy() {
      destroyed = true;
      if (tickTimer) clearTimeout(tickTimer);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }


  function setupServiceDots(grid, count) {
    const dotsWrap = $('#service-dots');
    if (!dotsWrap) return null;
    if (!count) {
      dotsWrap.innerHTML = '';
      return null;
    }
    dotsWrap.innerHTML = Array.from({ length: count })
      .map((_, i) => `<span class="dot${i === 0 ? ' is-active' : ''}"></span>`)
      .join('');
    const dots = $$('.dot', dotsWrap);
    const cards = $$('.service-card', grid);
    if (!cards.length) return null;

    function setActiveByIndex(idx) {
      const clamped = Math.max(0, Math.min(dots.length - 1, idx));
      dots.forEach((dot, i) => dot.classList.toggle('is-active', i === clamped));
    }

    return setActiveByIndex;
  }

  // 찬양 캐러셀: 9개씩 한 페이지로 넘어갈 때, 페이지 단위로 점을 켜줍니다 (모바일 전용)
  function setupPraiseDots(grid, count) {
    const dotsWrap = $('#praise-dots');
    if (!dotsWrap) return;
    const totalPages = Math.ceil(count / 9);
    if (!count || totalPages <= 1) {
      dotsWrap.innerHTML = '';
      return;
    }
    dotsWrap.innerHTML = Array.from({ length: totalPages })
      .map((_, i) => `<span class="dot${i === 0 ? ' is-active' : ''}"></span>`)
      .join('');
    const dots = $$('.dot', dotsWrap);

    let ticking = false;
    function updateActiveDot() {
      ticking = false;
      const pageWidth = grid.clientWidth || 1;
      const pageIndex = Math.round(grid.scrollLeft / pageWidth);
      const clamped = Math.max(0, Math.min(totalPages - 1, pageIndex));
      dots.forEach((dot, i) => dot.classList.toggle('is-active', i === clamped));
    }
    grid.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(updateActiveDot);
        }
      },
      { passive: true }
    );
  }

  // ---------------- 오늘의 큐티 ----------------
  function applyQtBackground(bg) {
    const stage = $('#qt-stage');
    const decor = $('#qt-decor');
    const presetGradients = {
      navy: 'linear-gradient(180deg, #0d1526 0%, #1c2b4a 100%)',
      gold: 'linear-gradient(160deg, #7a5c12 0%, #0d1526 70%)',
      dawn: 'linear-gradient(160deg, #4a3a63 0%, #b06a4f 55%, #e0a86a 100%)'
    };
    if (bg.type === 'photo' && bg.image) {
      stage.style.setProperty('--qt-photo-bg', `url('${bg.image}')`);
      decor.style.display = 'none';
    } else {
      stage.style.setProperty('--qt-photo-bg', presetGradients[bg.preset || 'navy']);
      decor.style.display = '';
    }
  }

  // 아멘 개수에 따라 뱃지 단계를 정합니다. (숫자는 절대 노출하지 않고, 문구/아이콘만 바뀝니다)
  function getQtAmenTier(amen) {
    const n = amen || 0;
    if (n <= 0) return null;
    if (n === 1) return { level: 1, icon: '🙏', label: '첫 아멘이 도착했어요' };
    if (n <= 5) return { level: 2, icon: '💛', label: '은혜를 나누고 있어요' };
    if (n <= 9) return { level: 3, icon: '✨', label: '은혜가 번지고 있어요' };
    if (n <= 14) return { level: 4, icon: '🔥', label: '뜨거운 은혜의 시간' };
    return { level: 5, icon: '🎉', label: '전교인 큐티 참여 완료' };
  }

  // "사사기 21:16-18" 같은 구절 표기를 "사사기 21장 16-18절"처럼 안내 문구용으로 바꿔줍니다.
  function formatVerseRefForRead(verseRef) {
    if (!verseRef) return '';
    const m = verseRef.trim().match(/^(.+?)\s*(\d+)\s*[:：]\s*(.+)$/);
    if (!m) return verseRef.trim();
    const [, book, chapter, verse] = m;
    return `${book.trim()} ${chapter}장 ${verse.trim()}절`;
  }

  function formatQtDate(dateStr = '') {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }

  async function loadQT() {
    const list = await getJSON('/api/qt');
    const stage = $('#qt-stage');
    const trackEl = $('#qt-carousel-track');
    const navPrev = $('#qt-nav-prev');
    const navNext = $('#qt-nav-next');
    const toggleWrap = $('.qt-archive-toggle-wrap');

    if (!list || list.length === 0) {
      trackEl.innerHTML = `<p class="qt-empty">아직 등록된 큐티가 없습니다.</p>`;
      navPrev.style.display = 'none';
      navNext.style.display = 'none';
      toggleWrap.style.display = 'none';
      return;
    }

    const [latest, ...rest] = list;

    // 오늘 카드든 지난 큐티 카드든 똑같은 구조로 만듭니다 (그리드에서는 CSS로 축소해서 보여줍니다).
    function buildQtCardHtml(q, { isToday }) {
      const tier = isToday ? getQtAmenTier(q.amen) : null;
      const readPrompt = formatVerseRefForRead(q.verseRef);
      return `
      <a class="qt-card ${isToday ? 'qt-card--today' : 'qt-card--archive-mini'}" href="/qt/${q.id}?from=home" data-id="${q.id}" data-title="${escapeHtml(q.title || '')}">
        <div class="qt-card-badges">
          <span class="qt-badge${isToday ? '' : ' qt-badge--archive'}">${isToday ? '오늘의 큐티' : formatQtDate(q.date)}</span>
          ${tier ? `<span class="qt-amen-badge qt-amen-badge--lv${tier.level}"><span class="qt-amen-badge-heart">♥</span> ${tier.label}</span>` : ''}
        </div>
        <div class="qt-card-photo"${q.bgImage ? ` style="--qt-photo-bg: url('${escapeHtml(q.bgImage)}')"` : ''}>
          <h3 class="qt-card-title"><span class="qt-title-chevron">「</span>${escapeHtml(q.title || '')}<span class="qt-title-chevron">」</span></h3>
          ${q.subtitle ? `<p class="qt-card-subtitle">${escapeHtml(q.subtitle)}</p>` : ''}
          ${q.verseRef ? `<p class="qt-card-photo-verseref">${escapeHtml(q.verseRef)}</p>` : ''}
        </div>
        ${readPrompt ? `<p class="qt-card-read-prompt">${escapeHtml(readPrompt)} 말씀을 읽어 보세요</p>` : ''}
        <div class="qt-card-foot">
          <span>${escapeHtml(q.pastor || '')}${q.pastor ? ' · ' : ''}${formatQtDate(q.date)}</span>
          <span>전체 보기 →</span>
        </div>
      </a>`;
    }

    const todayCardHtml = buildQtCardHtml(latest, { isToday: true });

    trackEl.innerHTML = todayCardHtml;

    // 오늘 카드에 보관함 사진이 배정되어 있으면, 예전 프리셋 장식(원/십자가)이 그 위에
    // 겹쳐 보이지 않도록 무조건 숨깁니다. (이 장식은 사진이 없는 프리셋 배경 전용입니다)
    if (latest.bgImage) {
      const decorEl = $('#qt-decor');
      if (decorEl) decorEl.style.display = 'none';
    }

    $$('#qt-carousel-track .qt-card--today').forEach((c) =>
      c.addEventListener('click', () =>
        track('click', { label: 'qt_card', itemType: 'qt', itemId: c.dataset.id, itemTitle: c.dataset.title })
      )
    );

    stage.classList.add('qt-stage--single');
    navPrev.style.display = 'none';
    navNext.style.display = 'none';

    if (rest.length === 0) {
      toggleWrap.style.display = 'none';
      return;
    }
    toggleWrap.style.display = '';

    const archiveWrap = $('#qt-archive-wrap');
    const archiveGrid = $('#qt-archive-grid');

    let archivePage = 0;

    function renderArchiveGrid() {
      const isDesktopNow = window.matchMedia('(min-width: 861px)').matches;

      if (!isDesktopNow) {
        // 모바일: 전체를 한 번에 렌더링하고 스크롤로 봅니다.
        archiveGrid.innerHTML = rest.map((q) => buildQtCardHtml(q, { isToday: false })).join('');
        bindArchiveCardClicks();
        return;
      }

      // PC: 2개씩 페이지를 나눠서 좌우 버튼/하단 번호로 넘겨봅니다.
      const perPage = 2;
      const totalPages = Math.max(1, Math.ceil(rest.length / perPage));
      if (archivePage >= totalPages) archivePage = totalPages - 1;
      if (archivePage < 0) archivePage = 0;

      const items = rest.slice(archivePage * perPage, archivePage * perPage + perPage);
      archiveGrid.innerHTML = items.map((q) => buildQtCardHtml(q, { isToday: false })).join('');
      bindArchiveCardClicks();

      const sidePrevBtn = $('#qt-archive-side-prev');
      const sideNextBtn = $('#qt-archive-side-next');
      if (sidePrevBtn) sidePrevBtn.disabled = archivePage === 0;
      if (sideNextBtn) sideNextBtn.disabled = archivePage >= totalPages - 1;

      const pageNumbersEl = $('#qt-archive-page-numbers');
      if (pageNumbersEl) {
        const WINDOW_SIZE = 10;
        // 현재 페이지가 항상 보이는 10개짜리 창을 계산합니다.
        let windowStart = Math.floor(archivePage / WINDOW_SIZE) * WINDOW_SIZE;
        const windowEnd = Math.min(totalPages, windowStart + WINDOW_SIZE);

        if (totalPages <= 1) {
          pageNumbersEl.innerHTML = '';
        } else {
          const numberButtons = [];
          for (let i = windowStart; i < windowEnd; i++) {
            numberButtons.push(`<button type="button" class="board-page-btn${i === archivePage ? ' active' : ''}" data-page="${i}">${i + 1}</button>`);
          }
          const hasPrevWindow = windowStart > 0;
          const hasNextWindow = windowEnd < totalPages;
          pageNumbersEl.innerHTML = `
            <button type="button" class="qt-archive-page-window-nav" id="qt-archive-window-prev" ${hasPrevWindow ? '' : 'disabled'}>‹</button>
            ${numberButtons.join('')}
            <button type="button" class="qt-archive-page-window-nav" id="qt-archive-window-next" ${hasNextWindow ? '' : 'disabled'}>›</button>
          `;
          $$('.board-page-btn', pageNumbersEl).forEach((btn) => {
            btn.addEventListener('click', () => {
              archivePage = Number(btn.dataset.page);
              renderArchiveGrid();
            });
          });
          const windowPrevBtn = $('#qt-archive-window-prev');
          const windowNextBtn = $('#qt-archive-window-next');
          if (windowPrevBtn) {
            windowPrevBtn.addEventListener('click', () => {
              archivePage = Math.max(0, windowStart - WINDOW_SIZE);
              renderArchiveGrid();
            });
          }
          if (windowNextBtn) {
            windowNextBtn.addEventListener('click', () => {
              archivePage = Math.min(totalPages - 1, windowStart + WINDOW_SIZE);
              renderArchiveGrid();
            });
          }
        }
      }
    }

    function bindArchiveCardClicks() {
      $$('.qt-card--archive-mini', archiveGrid).forEach((card) => {
        card.addEventListener('click', () =>
          track('click', { label: 'qt_archive_grid', itemType: 'qt', itemId: card.dataset.id, itemTitle: card.dataset.title })
        );
      });
    }

    const archiveSidePrevBtn = $('#qt-archive-side-prev');
    const archiveSideNextBtn = $('#qt-archive-side-next');
    if (archiveSidePrevBtn) {
      archiveSidePrevBtn.addEventListener('click', () => {
        archivePage -= 1;
        renderArchiveGrid();
      });
    }
    if (archiveSideNextBtn) {
      archiveSideNextBtn.addEventListener('click', () => {
        archivePage += 1;
        renderArchiveGrid();
      });
    }

    const archiveBackdrop = $('#qt-archive-backdrop');

    $('#qt-archive-toggle').addEventListener('click', () => {
      const isOpen = archiveWrap.classList.toggle('open');
      if (archiveBackdrop) archiveBackdrop.classList.toggle('open', isOpen);
      $('#qt-archive-toggle').textContent = isOpen ? '지난 큐티 접기 ▾' : '지난 큐티 보기 ▴';
      // 열 때마다 처음(1페이지/맨 위)부터 새로 그립니다.
      if (isOpen) {
        archivePage = 0;
        const scrollEl = $('#qt-archive-scroll');
        if (scrollEl) scrollEl.scrollTop = 0;
        renderArchiveGrid();
      }
    });

    function closeArchive() {
      archiveWrap.classList.remove('open');
      if (archiveBackdrop) archiveBackdrop.classList.remove('open');
      $('#qt-archive-toggle').textContent = '지난 큐티 보기 ▴';
    }

    const archiveCloseBtn = $('#qt-archive-close');
    if (archiveCloseBtn) archiveCloseBtn.addEventListener('click', closeArchive);
    if (archiveBackdrop) archiveBackdrop.addEventListener('click', closeArchive);
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

  function openMissionModal(card) {
    $('#mission-modal-name').textContent = card.name || '';
    $('#mission-modal-country').textContent = card.country || '';
    const photoImg = $('#mission-modal-photo');
    if (card.photo) {
      photoImg.src = card.photo;
      photoImg.style.display = '';
    } else {
      photoImg.style.display = 'none';
    }
    $('#mission-modal-content').textContent = card.content || '';

    const galleryWrap = $('#mission-modal-gallery');
    const gallery = Array.isArray(card.gallery) ? card.gallery.filter(Boolean) : [];
    galleryWrap.innerHTML = gallery
      .map((url) => `<img src="${url}" alt="${escapeHtml(card.name || '')} 사진" />`)
      .join('');

    const prayerWrap = $('#mission-modal-prayer-wrap');
    if (card.prayer) {
      $('#mission-modal-prayer').textContent = card.prayer;
      prayerWrap.style.display = '';
    } else {
      prayerWrap.style.display = 'none';
    }

    $('#mission-modal').classList.add('open');
    lockScroll();
  }
  function closeMissionModal() {
    $('#mission-modal').classList.remove('open');
    unlockScroll();
  }
  const missionModalCloseBtn = $('#mission-modal-close');
  if (missionModalCloseBtn) missionModalCloseBtn.addEventListener('click', closeMissionModal);
  const missionModalEl = $('#mission-modal');
  if (missionModalEl) {
    missionModalEl.addEventListener('click', (e) => {
      if (e.target.id === 'mission-modal') closeMissionModal();
    });
  }

  let missionCardsAutoTimer = null;
  function stopMissionCardsAuto() {
    if (missionCardsAutoTimer) {
      missionCardsAutoTimer();
      missionCardsAutoTimer = null;
    }
  }

  function renderMissionCards(cards) {
    const listEl = $('#mission-cards-row');
    const pageEl = $('#mission-cards-page');
    const prevBtn = $('#mission-cards-prev');
    const nextBtn = $('#mission-cards-next');
    if (!listEl) return;
    stopMissionCardsAuto();

    const cardHTML = (c, i) => `
      <div class="mission-card" data-index="${i}">
        <div class="mission-card-photo-wrap">
          ${c.photo ? `<img class="mission-card-photo" src="${c.photo}" alt="${escapeHtml(c.name || '')}" />` : `<div class="mission-card-photo-empty"></div>`}
        </div>
        <span class="mission-card-country">${escapeHtml(c.country || '')}</span>
        <h4 class="mission-card-name">${escapeHtml(c.name || '')}</h4>
        <p class="mission-card-content">${escapeHtml(c.content || '')}</p>
      </div>`;

    function bindCardClicks() {
      $$('.mission-card', listEl).forEach((el) => {
        el.onclick = () => openMissionModal(cards[Number(el.dataset.index)]);
      });
    }

    const isMobile = window.matchMedia('(max-width: 860px)').matches;

    if (isMobile) {
      // 모바일: 전체 카드를 한 번에 렌더링하고, 손가락 스와이프(가로 스크롤)로 넘겨봅니다.
      listEl.innerHTML = cards.map(cardHTML).join('');
      if (cards.length > 1) {
        // 앞쪽엔 마지막 카드 복제본, 뒤쪽엔 첫 카드 복제본을 둬서 양쪽 다 끝없이 순환하게 합니다.
        const lastCloneEl = document.createElement('div');
        lastCloneEl.innerHTML = cardHTML(cards[cards.length - 1], cards.length - 1);
        listEl.insertBefore(lastCloneEl.firstElementChild, listEl.firstChild);

        const firstCloneEl = document.createElement('div');
        firstCloneEl.innerHTML = cardHTML(cards[0], 0);
        listEl.appendChild(firstCloneEl.firstElementChild);
      }
      bindCardClicks();
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
      const setActiveDot = setupMissionCardDots(listEl, pageEl, cards.length);

      if (cards.length > 1) {
        missionCardsAutoTimer = setupInfiniteAutoScroll(listEl, cards.length, 3000, setActiveDot);
      }
      return;
    }

    // PC: 3개씩 페이지 버튼으로 넘겨봅니다 (자동 순환 포함).
    if (prevBtn) prevBtn.style.display = '';
    if (nextBtn) nextBtn.style.display = '';
    const perPage = 3;
    const totalPages = Math.max(1, Math.ceil(cards.length / perPage));
    let page = 0;

    function draw() {
      const slice = cards.slice(page * perPage, page * perPage + perPage);
      listEl.innerHTML = slice.map((c, i) => cardHTML(c, page * perPage + i)).join('');
      bindCardClicks();
      if (pageEl) {
        pageEl.innerHTML =
          totalPages > 1
            ? Array.from({ length: totalPages })
                .map((_, i) => `<button type="button" class="mission-cards-dot${i === page ? ' active' : ''}" data-page="${i}" aria-label="${i + 1}번째 화면"></button>`)
                .join('')
            : '';
        $$('.mission-cards-dot', pageEl).forEach((dot) => {
          dot.onclick = () => {
            page = Number(dot.dataset.page);
            draw();
            stopMissionCardsAuto();
          };
        });
      }
      if (prevBtn) prevBtn.disabled = totalPages <= 1;
      if (nextBtn) nextBtn.disabled = totalPages <= 1;
    }

    if (prevBtn) {
      prevBtn.onclick = () => {
        page = (page - 1 + totalPages) % totalPages;
        draw();
        stopMissionCardsAuto();
      };
    }
    if (nextBtn) {
      nextBtn.onclick = () => {
        page = (page + 1) % totalPages;
        draw();
        stopMissionCardsAuto();
      };
    }
    draw();

    if (totalPages > 1) {
      const intervalId = setInterval(() => {
        page = (page + 1) % totalPages;
        draw();
      }, 3000);
      missionCardsAutoTimer = () => clearInterval(intervalId);
    }
  }

  function setupMissionCardDots(row, dotsWrap, count) {
    if (!dotsWrap) return null;
    if (!count || count <= 1) {
      dotsWrap.innerHTML = '';
      return null;
    }
    dotsWrap.innerHTML = Array.from({ length: count })
      .map((_, i) => `<span class="mission-cards-dot${i === 0 ? ' active' : ''}"></span>`)
      .join('');
    const dots = $$('.mission-cards-dot', dotsWrap);

    function setActiveByIndex(idx) {
      const clamped = Math.max(0, Math.min(count - 1, idx));
      dots.forEach((dot, i) => dot.classList.toggle('active', i === clamped));
    }

    return setActiveByIndex;
  }

  async function loadMissions() {
    const [site, partners] = await Promise.all([getJSON('/api/site'), getJSON('/api/partners')]);
    const rawCards = (site && site.missions && site.missions.cards) || [];
    const missionCards = rawCards.filter((c) => c && (c.name || c.country || c.content || c.photo));
    const partnersList = partners || [];

    if (missionCards.length === 0 && partnersList.length === 0) {
      $('#missions').style.display = 'none';
      return;
    }

    const cardsWrap = $('.mission-cards-wrap');
    if (missionCards.length === 0) {
      if (cardsWrap) cardsWrap.style.display = 'none';
    } else {
      if (cardsWrap) cardsWrap.style.display = '';
      renderMissionCards(missionCards);
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

  // ---------------- 맨 위로 이동 버튼 ----------------
  function setupScrollTopButton() {
    const btn = $('#scroll-top-btn');
    if (!btn) return;
    let ticking = false;
    let hideTimer = null;
    const isMobile = () => window.matchMedia('(max-width: 900px)').matches;

    function scheduleAutoHide() {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        btn.classList.remove('visible');
      }, 1500);
    }

    function update() {
      const pastThreshold = window.scrollY > 600;
      if (isMobile()) {
        // 모바일: 스크롤 중일 때만 보이고, 멈추면 잠시 후 사라짐 (기준 스크롤 위치를 넘었을 때만)
        if (pastThreshold) {
          btn.classList.add('visible');
          scheduleAutoHide();
        } else {
          btn.classList.remove('visible');
        }
      } else {
        btn.classList.toggle('visible', pastThreshold);
      }
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    });
    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  setupScrollTopButton();

  // ---------------- 해시(#qt 등)로 진입했을 때, 데이터·폰트 준비 후 한 번만 이동 ----------------
  // index.html의 head 스크립트에서 location.hash를 미리 떼어 window.__pendingScrollHash에
  // 저장해뒀습니다(브라우저의 이른 앵커 점프 방지). 설교·찬양·게시판 카드의 사진 자리는
  // CSS aspect-ratio로 이미 예약돼 있어 사진 로딩 자체를 따로 기다릴 필요는 없습니다.
  // 아래 함수는 head 스크립트가 "데이터 + 폰트"까지 모두 준비된 뒤 딱 한 번만 호출해서,
  // 화면이 공개되기 직전에 정확한 위치로 이동시켜 줍니다.
  window.__performPendingScroll = function () {
    const hash = window.__pendingScrollHash;
    if (!hash) return;
    window.__pendingScrollHash = null;
    const target = document.querySelector(hash);
    if (!target) return;
    // style.css에 html { scroll-behavior: smooth; }가 걸려 있어서, 그냥
    // scrollIntoView({ behavior: 'auto' })만으로는 "즉시 이동"이 아니라
    // CSS를 따라 부드럽게(smooth) 움직여버립니다. 화면 공개 직전 딱 이 순간만큼은
    // 확실하게 즉시 이동하도록 scroll-behavior를 잠깐 꺼뒀다가 되돌립니다.
    const html = document.documentElement;
    const prevScrollBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    target.scrollIntoView({ block: 'start', behavior: 'auto' });
    html.style.scrollBehavior = prevScrollBehavior;
    // 주소창에 #qt를 다시 붙이면, 그 이후 평범하게 새로고침할 때마다 계속
    // 큐티로 이동해버리는 문제가 생기므로 URL은 계속 깨끗한 '/'로 둡니다.
  };

  // 큐티(#qt)보다 위쪽 섹션(사이트정보·메뉴·설교·찬양·게시판·큐티)의 데이터만 스크롤
  // 위치 계산에 영향을 줍니다. 아래쪽 섹션(선교·퀴즈)은 화면 공개를 굳이 기다릴
  // 필요가 없어서, 느린 네트워크에서도 화면이 빨리 뜨도록 따로 분리해 불러옵니다.
  Promise.all([loadSite(), loadMenu(), loadSermons(), loadPraises(), loadBoard(), loadQT()])
    .catch((err) => {
      console.error('콘텐츠를 불러오는 중 오류가 발생했습니다:', err);
    })
    .finally(() => {
      if (window.__resolveDataReady) window.__resolveDataReady();
    });

  Promise.all([loadMissions(), loadQuizTeaser()]).catch((err) => {
    console.error('선교/퀴즈 콘텐츠를 불러오는 중 오류가 발생했습니다:', err);
  });
})();
