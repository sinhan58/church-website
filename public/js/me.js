// 마이페이지: 카카오 로그인 + 내 활동(성경 읽기, 아멘한 큐티, 말씀 퀴즈) 모아 보기
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  function escapeHtml(str = '') {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso).slice(0, 10).replace(/-/g, '.');
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  // 홈페이지 디자인에 맞춘 안내 창 (브라우저 기본 알림창 대신)
  function showNotice({ icon = '', title = '', text = '', actions } = {}) {
    const modal = $('#me-notice-modal');
    $('#me-notice-icon').textContent = icon;
    $('#me-notice-title').textContent = title;
    $('#me-notice-text').textContent = text;
    const wrap = $('#me-notice-actions');
    wrap.innerHTML = '';
    (actions && actions.length ? actions : [{ label: '확인', primary: true }]).forEach((a) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bible-confirm-btn' + (a.primary ? ' is-primary' : ' is-quiet');
      btn.textContent = a.label;
      btn.addEventListener('click', () => {
        modal.classList.remove('open');
        if (a.onClick) a.onClick();
      });
      wrap.appendChild(btn);
    });
    modal.classList.add('open');
  }

  // 교회 이름(머리글·바닥글)
  $('#me-year').textContent = new Date().getFullYear();
  fetch('/api/site')
    .then((r) => r.json())
    .then((site) => {
      if (site && site.churchName) {
        $('#me-brand-text').textContent = site.churchName;
        $('#me-footer-name').textContent = site.churchName;
      }
    })
    .catch(() => {});

  // 로그인 후 돌아갈 곳: ?return=/quiz.html 처럼 받은 홈페이지 안 주소, 없으면 마이페이지
  function returnPath() {
    const r = new URLSearchParams(location.search).get('return') || '';
    if (r.startsWith('/') && !r.startsWith('//') && !r.includes('\\')) return r;
    return '/me.html';
  }

  // ---------------- 카카오 로그인 ----------------
  let kakaoConfig = null;
  function loadKakaoSdk() {
    return new Promise((resolve, reject) => {
      if (window.Kakao) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js';
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function setupKakao() {
    return fetch('/api/bible/kakao-config')
      .then((r) => r.json())
      .then((cfg) => {
        kakaoConfig = cfg;
        if (!cfg.enabled) return;
        return loadKakaoSdk().then(() => {
          if (!window.Kakao.isInitialized()) window.Kakao.init(cfg.jsKey);
        });
      })
      .catch(() => { kakaoConfig = { enabled: false }; });
  }

  $('#me-login-btn').addEventListener('click', () => {
    if (!kakaoConfig || !kakaoConfig.enabled || !window.Kakao || !window.Kakao.isInitialized()) {
      showNotice({ icon: '⚠️', title: '지금은 로그인할 수 없어요', text: '잠시 후 다시 시도해 주세요.' });
      return;
    }
    window.Kakao.Auth.authorize({
      redirectUri: kakaoConfig.redirectUri,
      state: encodeURIComponent(returnPath())
    });
  });

  $('#me-logout-btn').addEventListener('click', () => {
    fetch('/api/me/logout', { method: 'POST' })
      .then((r) => { if (!r.ok) throw new Error(); location.href = '/'; })
      .catch(() => showNotice({ icon: '⚠️', title: '로그아웃하지 못했어요', text: '잠시 후 다시 시도해 주세요.' }));
  });

  $('#me-delete-btn').addEventListener('click', () => {
    showNotice({
      icon: '🗑️',
      title: '내 기록을 모두 삭제할까요?',
      text: '성경 읽기 기록, 아멘한 큐티 목록, 닉네임이 삭제되고 로그아웃돼요.\n말씀 퀴즈 순위표의 이름과 점수는 그대로 남아요.\n삭제한 기록은 되돌릴 수 없어요.',
      actions: [
        {
          label: '모두 삭제하기',
          primary: true,
          onClick: () => {
            fetch('/api/me/delete', { method: 'POST' })
              .then((r) => { if (!r.ok) throw new Error(); location.href = '/'; })
              .catch(() => showNotice({ icon: '⚠️', title: '삭제하지 못했어요', text: '잠시 후 다시 시도해 주세요.' }));
          }
        },
        { label: '취소' }
      ]
    });
  });

  // ---------------- 내 활동 그리기 ----------------
  let currentName = '';

  function setName(name) {
    currentName = name || '';
    $('#me-nickname').textContent = currentName ? `${currentName} 님` : '이름을 정해 주세요';
    $('#me-avatar').textContent = currentName ? currentName.trim().charAt(0) : '?';
    $('#me-name-value').textContent = currentName;
  }

  function renderActivity(a) {
    setName(a.nickname);
    $('#me-since').textContent = a.firstLoginAt ? `${formatDate(a.firstLoginAt)}부터 함께하고 있어요` : '카카오로 로그인했어요';

    const b = a.bible || {};
    const total = b.total || 1189;
    const read = b.readCount || 0;
    const pct = total ? (read / total) * 100 : 0;
    $('#me-bible-count').textContent = read.toLocaleString();
    $('#me-bible-of').textContent = `/ ${total.toLocaleString()}장`;
    $('#me-ring').setAttribute('aria-label', `성경 ${total}장 중 ${read}장 읽음 (${Math.round(pct * 10) / 10}%)`);
    // 한 장이라도 읽었으면 고리가 보이도록 최소 1%
    requestAnimationFrame(() => $('#me-ring').style.setProperty('--p', read > 0 ? Math.max(1, pct).toFixed(2) : 0));
    $('#me-ot').textContent = b.ot ? `${b.ot.read} / ${b.ot.total}장` : '-';
    $('#me-nt').textContent = b.nt ? `${b.nt.read} / ${b.nt.total}장` : '-';
    $('#me-books').textContent = `${b.completedBooks || 0}권`;
    const cont = $('#me-continue-btn');
    if (b.lastRead) {
      cont.href = `/bible.html?b=${encodeURIComponent(b.lastRead.code)}&c=${b.lastRead.chapter}`;
      cont.textContent = `${b.lastRead.name} ${b.lastRead.chapter}장 이어 읽기`;
    }

    const amen = a.amen || [];
    $('#me-amen-count').textContent = amen.length ? `${amen.length}개` : '';
    $('#me-amen-list').innerHTML = amen.length
      ? amen.map((q) => {
          const d = q.date ? new Date(q.date) : null;
          const ok = d && !isNaN(d);
          return `
          <li><a href="/qt/${encodeURIComponent(q.id)}">
            <span class="me-qt-date">${ok ? `<b>${d.getDate()}</b><span>${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}</span>` : ''}</span>
            <span class="me-qt-text">
              <span class="me-qt-title">${escapeHtml(q.title)}</span>
              ${q.verseRef ? `<span class="me-qt-ref">${escapeHtml(q.verseRef)}</span>` : ''}
            </span>
            <span class="me-qt-heart" aria-label="아멘">♥</span>
          </a></li>`;
        }).join('')
      : '<li class="me-empty-row">아직 아멘한 큐티가 없어요. <a href="/#qt">오늘의 큐티</a>를 읽고 아멘을 눌러 보세요.</li>';

    const quizzes = a.quizzes || [];
    $('#me-quiz-count').textContent = quizzes.length ? `${quizzes.length}회` : '';
    $('#me-quiz-list').innerHTML = quizzes.length
      ? quizzes.map((q) => `
          <li>
            <div class="me-quiz-text">
              <span class="me-quiz-title">${escapeHtml(q.title)}</span>
              <span class="me-quiz-sub">${formatDate(q.submittedAt)} 참여, ${q.totalBlanks}문제 중 ${q.correctCount}개 정답</span>
            </div>
            <div class="me-quiz-score"><b>${escapeHtml(String(q.score))}</b><span>점</span></div>
          </li>`).join('')
      : '<li class="me-empty-row">아직 참여한 말씀 퀴즈가 없어요. <a href="/quiz.html">이번 주 퀴즈 풀기</a></li>';
  }

  // ---------------- 이름 정하기 / 바꾸기 ----------------
  function openNameModal({ first = false } = {}) {
    $('#me-name-title').textContent = first ? '홈페이지에서 쓸 이름을 정해 주세요' : '이름 바꾸기';
    $('#me-name-desc').textContent = first
      ? '카카오 닉네임을 받아오지 못했어요. 상단 메뉴와 말씀 퀴즈 순위표에 표시될 이름을 정해 주세요.'
      : '상단 메뉴와 말씀 퀴즈 순위표에 이 이름으로 표시돼요.';
    $('#me-name-input').value = currentName;
    $('#me-name-error').textContent = '';
    $('#me-name-modal').classList.add('open');
    setTimeout(() => $('#me-name-input').focus(), 50);
  }
  function closeNameModal() { $('#me-name-modal').classList.remove('open'); }
  function saveName() {
    const name = $('#me-name-input').value.trim();
    if (!name) { $('#me-name-error').textContent = '이름을 입력해 주세요.'; return; }
    const btn = $('#me-name-save');
    btn.disabled = true;
    fetch('/api/me/name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d.error || '저장하지 못했어요.');
        setName(d.nickname);
        closeNameModal();
      })
      .catch((err) => { $('#me-name-error').textContent = err.message; })
      .finally(() => { btn.disabled = false; });
  }
  $('#me-name-btn').addEventListener('click', () => openNameModal());
  $('#me-name-save').addEventListener('click', saveName);
  $('#me-name-cancel').addEventListener('click', closeNameModal);
  $('#me-name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveName(); });

  // 창(읽기표·책 선택·확인·안내 창 등)이 열려 있는 동안 뒤쪽 페이지 스크롤을 잠급니다.
  // (style.css의 html.bible-modal-open) 창이 열리고 닫히는 것은 'open' 클래스로 알 수 있어서,
  // 창을 여닫는 코드를 하나하나 고치지 않고 클래스 변화를 지켜보다가 켜고 끕니다.
  (function setupModalScrollLock() {
    const modals = document.querySelectorAll('.bible-progress-modal, .bible-book-modal');
    if (!modals.length || !window.MutationObserver) return;
    const update = () => {
      const anyOpen = Array.prototype.some.call(modals, (m) => m.classList.contains('open'));
      document.documentElement.classList.toggle('bible-modal-open', anyOpen);
    };
    const observer = new MutationObserver(update);
    modals.forEach((m) => observer.observe(m, { attributes: true, attributeFilter: ['class'] }));
    update();
  })();

  // ---------------- 시작 ----------------
  const params = new URLSearchParams(location.search);
  Promise.all([
    fetch('/api/me').then((r) => r.json()).catch(() => ({ loggedIn: false })),
    setupKakao()
  ]).then(([me]) => {
    $('#me-loading').hidden = true;
    if (params.get('kakaoError')) {
      showNotice({ icon: '⚠️', title: '카카오 로그인에 실패했어요', text: '잠시 후 다시 시도해 주세요.' });
    }
    if (!me.loggedIn) {
      $('#me-login-card').hidden = false;
      return;
    }
    // 다른 페이지에서 로그인하러 왔다가 이미 로그인된 경우 바로 돌려보냄
    const back = params.get('return');
    if (back && returnPath() !== '/me.html') { location.replace(returnPath()); return; }
    return fetch('/api/me/activity')
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((a) => {
        renderActivity(a);
        $('#me-content').hidden = false;
        // 카카오 닉네임도, 직접 정한 이름도 없으면 이름부터 정하도록 안내
        if (!a.nickname) openNameModal({ first: true });
      })
      .catch(() => {
        $('#me-loading').hidden = false;
        $('#me-loading').textContent = '내 활동을 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.';
      });
  });
})();
