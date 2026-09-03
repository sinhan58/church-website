(function () {
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

  // 아멘 개수에 따라 뱃지 단계를 정합니다. (숫자는 절대 노출하지 않고, 문구/아이콘만 바뀝니다)
  function getQtAmenTier(amen) {
    const n = amen || 0;
    if (n <= 0) return null;
    if (n === 1) return { level: 1, icon: '🙏', label: '첫 아멘이 도착했어요', hearts: 3, color: '#f4a6c1' };
    if (n <= 5) return { level: 2, icon: '💛', label: '은혜를 나누고 있어요', hearts: 5, color: '#f07a9e' };
    if (n <= 9) return { level: 3, icon: '✨', label: '은혜가 번지고 있어요', hearts: 7, color: '#ea4c78' };
    if (n <= 14) return { level: 4, icon: '🔥', label: '뜨거운 은혜의 시간', hearts: 9, color: '#e8482f' };
    return { level: 5, icon: '🎉', label: '전교인 큐티 참여 완료', hearts: 12, color: '#d61f1f' };
  }

  function updateAmenBadge(amen) {
    const badgeEl = document.getElementById('qt-amen-badge');
    if (!badgeEl) return;
    const tier = getQtAmenTier(amen);
    if (!tier) {
      badgeEl.style.display = 'none';
      return;
    }
    badgeEl.className = `qt-amen-badge qt-amen-badge--lv${tier.level}`;
    badgeEl.innerHTML = `<span class="qt-amen-badge-heart">♥</span> ${tier.label}`;
    badgeEl.style.display = '';
  }

  // '홈으로' 버튼 — 홈페이지 큐티 카드를 눌러서 들어온 경우라면, 페이지를 다시
  // 불러올 필요 없이 뒤로 가기만 하면 원래 보던 화면(스크롤 위치까지) 그대로
  // 순간 이동합니다. 로딩/깜빡임/버벅임이 전혀 없는 가장 매끄러운 방법입니다.
  // 홈에서 왔는지 여부는 서버가 이미 안정적으로 판단해서 data-back 속성으로
  // 알려줍니다(홈페이지 큐티 카드 링크의 ?from=home 표시를 기준으로 판단하며,
  // 브라우저의 Referer 정보에 기대지 않아 PC/모바일 어디서나 일관되게 동작합니다).
  const homeBtn = document.getElementById('qt-home-btn');
  if (homeBtn && homeBtn.dataset.back === '1' && history.length > 1) {
    homeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const startPath = location.pathname;
      history.back();
      // 일부 브라우저 확장 프로그램(광고 차단기 등)이 history.back()을 막거나
      // 무시하는 경우가 있어서, 짧은 시간 안에 실제로 페이지를 벗어났는지 확인하고
      // 안 벗어났으면 안전하게 홈페이지로 직접 이동시킵니다. 정상적으로 뒤로가기가
      // 됐다면 이미 다른 페이지로 넘어가 있을 것이므로 아래 코드는 실행되지 않습니다.
      setTimeout(() => {
        if (location.pathname === startPath) {
          location.href = '/';
        }
      }, 300);
    });
  }

  const amenBtn = document.getElementById('qt-amen-btn');
  const heartEl = document.getElementById('qt-heart');
  const shareBtn = document.getElementById('qt-share-btn');
  const listenBtn = document.getElementById('qt-listen-btn');

  if (listenBtn) {
    const supportsTTS = 'speechSynthesis' in window;
    if (!supportsTTS) {
      listenBtn.style.display = 'none';
    } else {
      let isSpeaking = false;

      function buildReadingText() {
        const parts = [];
        const title = document.querySelector('.qt-detail-title');
        if (title) parts.push(title.textContent.trim());

        const verseRef = document.querySelector('.qt-verse-ref');
        const verseText = document.querySelector('.qt-verse-text');
        if (verseRef) parts.push(verseRef.textContent.trim());
        if (verseText) parts.push(verseText.textContent.trim());

        const body = document.querySelector('.qt-detail-body');
        if (body) parts.push(body.textContent.trim());

        return parts.filter(Boolean).join('. ');
      }

      function stopReading() {
        window.speechSynthesis.cancel();
        isSpeaking = false;
        document.getElementById('qt-listen-icon').textContent = '🔊';
        document.getElementById('qt-listen-label').textContent = '듣기';
      }

      listenBtn.addEventListener('click', () => {
        if (isSpeaking) {
          stopReading();
          track('click', { label: 'listen_stop' });
          return;
        }
        const text = buildReadingText();
        if (!text) return;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ko-KR';
        utterance.rate = 0.95;
        utterance.onend = stopReading;
        utterance.onerror = stopReading;

        window.speechSynthesis.cancel(); // 혹시 이전에 남아있던 음성이 있으면 정리하고 새로 시작
        window.speechSynthesis.speak(utterance);
        isSpeaking = true;
        document.getElementById('qt-listen-icon').textContent = '⏸';
        document.getElementById('qt-listen-label').textContent = '멈추기';
        track('click', { label: 'listen_start' });
      });

      // 페이지를 벗어나면 음성이 계속 재생되지 않도록 정리합니다.
      window.addEventListener('beforeunload', () => window.speechSynthesis.cancel());
    }
  }

  if (amenBtn) {
    const qtId = amenBtn.dataset.id;
    const storageKey = `qt-amen-${qtId}`;

    function setPressedState(pressed) {
      amenBtn.classList.toggle('pressed', pressed);
      heartEl.textContent = pressed ? '♥' : '♡';
    }

    function playPopEffect(amen) {
      const tier = getQtAmenTier(amen) || { hearts: 5, color: '#f07a9e' };
      amenBtn.classList.remove('pop');
      void amenBtn.offsetWidth; // 리플레이를 위해 강제로 리플로우
      amenBtn.classList.add('pop');

      for (let i = 0; i < tier.hearts; i++) {
        const p = document.createElement('span');
        p.className = 'qt-heart-particle';
        p.textContent = '♥';
        p.style.color = tier.color;
        p.style.left = `${50 + (Math.random() * 40 - 20)}%`;
        p.style.animationDelay = `${i * 0.05}s`;
        amenBtn.appendChild(p);
        setTimeout(() => p.remove(), 1000);
      }
    }

    setPressedState(localStorage.getItem(storageKey) === '1');

    amenBtn.addEventListener('click', async () => {
      const alreadyPressed = localStorage.getItem(storageKey) === '1';
      const action = alreadyPressed ? 'remove' : 'add';

      // 먼저 화면을 바꿔서 반응이 즉각적으로 느껴지게 하고, 실패하면 되돌립니다.
      setPressedState(!alreadyPressed);

      try {
        const res = await fetch(`/api/qt/${qtId}/amen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action })
        });
        if (!res.ok) throw new Error('요청 실패');
        const data = await res.json();
        localStorage.setItem(storageKey, alreadyPressed ? '0' : '1');
        updateAmenBadge(data.amen);
        if (!alreadyPressed) {
          playPopEffect(data.amen);
          track('click', { label: 'amen_button' });
        }
      } catch (err) {
        setPressedState(alreadyPressed); // 실패 시 원상복구
      }
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      track('click', { label: 'share_button' });
      const title = shareBtn.dataset.title;
      const url = shareBtn.dataset.url;

      // 링크만 보내면 카카오톡 등 메신저가 og:image(방금 만든 포스터 사진)로 자동으로
      // 사진+제목+URL이 다 들어간 미리보기 카드를 만들어줍니다. 이게 사진 파일을 직접
      // 첨부하는 것보다 훨씬 안정적으로 "사진과 링크가 같이" 전달되는 방법입니다
      // (파일을 같이 보내면 앱에 따라 URL 텍스트가 누락되는 경우가 있습니다).
      if (navigator.share) {
        try {
          await navigator.share({ title, url });
        } catch (err) {
          // 사용자가 공유를 취소한 경우 등은 조용히 무시
        }
        return;
      }

      try {
        await navigator.clipboard.writeText(url);
        const original = shareBtn.textContent;
        shareBtn.textContent = '링크가 복사되었습니다';
        setTimeout(() => (shareBtn.textContent = original), 2000);
      } catch (err) {
        alert(url);
      }
    });
  }
})();
