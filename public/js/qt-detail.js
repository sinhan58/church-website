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

  // '홈으로' 버튼: 홈페이지의 큐티 섹션을 보다가 들어온 경우엔, 새로 페이지를
  // 불러와서 스크롤 위치를 다시 계산하는 대신 브라우저의 "뒤로가기"를 그대로
  // 사용합니다. PC에서 뒤로가기를 눌렀을 때처럼 스크롤 위치까지 그대로 즉시
  // 복원되어(bfcache), 로딩이나 스크롤 이동이 전혀 보이지 않습니다.
  // 뒤로 갈 페이지가 없는 경우(새 탭으로 열었거나 등)에는 그냥 평소 링크(/#qt)로
  // 안전하게 이동하도록 놔둡니다.
  const homeBtn = document.getElementById('qt-home-btn');
  if (homeBtn && homeBtn.dataset.cameFromHome === '1') {
    homeBtn.addEventListener('click', (e) => {
      if (window.history.length > 1) {
        e.preventDefault();
        window.history.back();
      }
    });
  }

  const amenBtn = document.getElementById('qt-amen-btn');
  const heartEl = document.getElementById('qt-heart');
  const shareBtn = document.getElementById('qt-share-btn');

  if (amenBtn) {
    const qtId = amenBtn.dataset.id;
    const storageKey = `qt-amen-${qtId}`;

    function setPressedState(pressed) {
      amenBtn.classList.toggle('pressed', pressed);
      heartEl.textContent = pressed ? '♥' : '♡';
    }

    function playPopEffect() {
      amenBtn.classList.remove('pop');
      void amenBtn.offsetWidth; // 리플레이를 위해 강제로 리플로우
      amenBtn.classList.add('pop');

      for (let i = 0; i < 5; i++) {
        const p = document.createElement('span');
        p.className = 'qt-heart-particle';
        p.textContent = '♥';
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
      if (!alreadyPressed) {
        playPopEffect();
        track('click', { label: 'amen_button' });
      }

      try {
        const res = await fetch(`/api/qt/${qtId}/amen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action })
        });
        if (!res.ok) throw new Error('요청 실패');
        localStorage.setItem(storageKey, alreadyPressed ? '0' : '1');
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

      // 카카오톡 등 메신저는 링크만 보내면 og 태그로 자동 카드 미리보기를 만들어줍니다.
      // title/text까지 같이 보내면 텍스트 말풍선과 카드가 중복으로 노출되어 링크만 전달합니다.
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
