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
  function renderActivity(a) {
    $('#me-nickname').textContent = a.nickname || '성도';
    $('#me-avatar').textContent = (a.nickname || '🙂').trim().charAt(0) || '🙂';
    $('#me-since').textContent = a.firstLoginAt ? `${formatDate(a.firstLoginAt)}부터 함께하고 있어요` : '';

    const b = a.bible || {};
    const pct = b.total ? Math.round(((b.readCount || 0) / b.total) * 1000) / 10 : 0;
    $('#me-bible-count').textContent = (b.readCount || 0).toLocaleString();
    $('#me-bible-of').textContent = `/ 전체 ${(b.total || 1189).toLocaleString()}장 (${pct}%)`;
    $('#me-bible-bar').style.width = `${Math.min(100, pct)}%`;
    $('#me-ot').textContent = b.ot ? `${b.ot.read}/${b.ot.total}장` : '-';
    $('#me-nt').textContent = b.nt ? `${b.nt.read}/${b.nt.total}장` : '-';
    $('#me-books').textContent = `${b.completedBooks || 0}권`;
    const cont = $('#me-continue-btn');
    if (b.lastRead) {
      cont.href = `/bible.html?b=${encodeURIComponent(b.lastRead.code)}&c=${b.lastRead.chapter}`;
      cont.textContent = `${b.lastRead.name} ${b.lastRead.chapter}장부터 이어 읽기 →`;
    }

    const amen = a.amen || [];
    $('#me-amen-count').textContent = amen.length ? `${amen.length}` : '';
    $('#me-amen-list').innerHTML = amen.length
      ? amen.map((q) => `
          <li><a href="/qt/${encodeURIComponent(q.id)}">
            <span class="me-list-title">${escapeHtml(q.title)}</span>
            <span class="me-list-meta">${escapeHtml([q.verseRef, formatDate(q.date)].filter(Boolean).join(' · '))}</span>
          </a></li>`).join('')
      : '<li class="me-empty">아직 아멘한 큐티가 없어요. 오늘의 큐티를 읽고 ♥ 아멘을 눌러 보세요.</li>';

    const quizzes = a.quizzes || [];
    $('#me-quiz-count').textContent = quizzes.length ? `${quizzes.length}` : '';
    $('#me-quiz-list').innerHTML = quizzes.length
      ? quizzes.map((q) => `
          <li><div class="me-list-row">
            <span class="me-list-title">${escapeHtml(q.title)}</span>
            <span class="me-list-meta">${q.correctCount}/${q.totalBlanks} 정답 · ${escapeHtml(String(q.score))}점 · ${formatDate(q.submittedAt)}</span>
          </div></li>`).join('')
      : '<li class="me-empty">아직 참여한 말씀 퀴즈가 없어요.</li>';
  }

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
      })
      .catch(() => {
        $('#me-loading').hidden = false;
        $('#me-loading').textContent = '내 활동을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
      });
  });
})();
