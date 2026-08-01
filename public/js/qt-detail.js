(function () {
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
      if (!alreadyPressed) playPopEffect();

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
      const title = shareBtn.dataset.title;
      const text = shareBtn.dataset.text;
      const url = shareBtn.dataset.url;

      if (navigator.share) {
        try {
          await navigator.share({ title, text, url });
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
