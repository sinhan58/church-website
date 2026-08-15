// 이번 주 말씀 퀴즈 (public/quiz.html에서 사용)
// 채점은 시험이 아니라 "즐겁게 참여하는" 용도라, 서버 왕복 없이 이 파일 안에서
// 직접 정답을 비교합니다. (부정행위를 막는 보안 장치가 아니라, 참여 자체를 가볍고
// 빠르게 만드는 데 목적이 있습니다)
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(str = '') {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  $('#quiz-year').textContent = new Date().getFullYear();
  fetch('/api/site')
    .then((res) => res.json())
    .then((site) => {
      if (site && site.churchName) {
        document.title = `${document.title} | ${site.churchName}`;
        $('#quiz-brand').textContent = site.churchName;
        $('#quiz-footer-name').textContent = site.churchName;
      }
    })
    .catch(() => {});

  const mainEl = $('#quiz-main');
  let quiz = null; // 현재 퀴즈 데이터
  let verseIndex = 0; // 지금 풀고 있는 절 인덱스
  let verseResults = []; // 절마다: { verseId, blanks: [{blankId, correct, firstTry, usedHint}] }
  let participantName = '';

  function totalBlankCount() {
    return quiz.verses.reduce((sum, v) => sum + v.blanks.length, 0);
  }

  // ---------------- 0단계: 불러오기 ----------------
  async function init() {
    try {
      const res = await fetch('/api/quiz/current');
      const data = await res.json();
      if (!data) {
        mainEl.innerHTML = `<div class="quiz-card"><p class="quiz-empty">아직 등록된 이번 주 말씀 퀴즈가 없어요. 다음 주에 다시 찾아와 주세요!</p></div>`;
        return;
      }
      quiz = data;
      renderNameAndRead();
      loadLeaderboard();
    } catch (err) {
      mainEl.innerHTML = `<div class="quiz-card"><p class="quiz-empty">불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p></div>`;
    }
  }

  // ---------------- 1단계: 본문 읽기 ----------------
  function renderNameAndRead() {
    const layout = $('.quiz-layout');
    if (layout) layout.classList.add('reading-stage');

    const readHtml = quiz.verses
      .map((v) => `<div class="quiz-read-verse"><span class="num">${escapeHtml(v.verseLabel)}</span>${escapeHtml(v.fullText)}</div>`)
      .join('');

    mainEl.innerHTML = `
      <div class="quiz-card">
        <p class="quiz-ref">${escapeHtml(quiz.reference)}</p>
        <p class="quiz-week-label">${escapeHtml(quiz.weekLabel || '')}</p>

        <div class="quiz-read-text">${readHtml}</div>

        <div class="quiz-btn-row">
          <button type="button" class="btn btn--gold" id="quiz-start-btn">다 읽었어요, 문제 풀기 시작 →</button>
        </div>
      </div>`;

    $('#quiz-start-btn').addEventListener('click', () => {
      if (layout) layout.classList.remove('reading-stage');
      verseIndex = 0;
      verseResults = [];
      renderVerseStep();
    });
  }

  // 이번 주 퀴즈에 같은 이름으로 이미 참여했는지 순위표를 기준으로 확인합니다.
  async function hasAlreadyParticipated(name) {
    try {
      const res = await fetch(`/api/quiz/${quiz.id}/leaderboard`);
      const list = await res.json();
      const normalized = name.trim();
      return (list || []).some((p) => (p.name || '').trim() === normalized);
    } catch (err) {
      return false; // 확인에 실패해도 참여 자체는 막지 않음
    }
  }

  function scrollQuizTop() {
    const card = mainEl.closest('.container') || mainEl;
    const top = card.getBoundingClientRect().top + window.scrollY - 90; // 고정 헤더 높이만큼 여유
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  // ---------------- 2단계: 한 절씩 풀기 ----------------
  function renderVerseStep() {
    scrollQuizTop();
    const verse = quiz.verses[verseIndex];
    const parts = verse.markedText.split(/(\{\{b\d+\}\})/g);

    const bodyHtml = parts
      .map((part) => {
        const m = part.match(/^\{\{(b\d+)\}\}$/);
        if (!m) return escapeHtml(part);
        const blankId = m[1];
        return `<input type="text" class="quiz-blank-input" data-blank-id="${blankId}" autocomplete="off" />`;
      })
      .join('');

    // 첫 번째 절에서만, 문제 바로 위에 이름 입력란을 눈에 띄게 보여줍니다.
    const nameFieldHtml =
      verseIndex === 0
        ? `<div class="quiz-name-field">
             <input type="text" id="quiz-name-input" placeholder="이름을 입력해주세요" maxlength="20" />
             <p class="quiz-name-notice" id="quiz-name-notice"></p>
           </div>`
        : '';

    mainEl.innerHTML = `
      <div class="quiz-card">
        ${nameFieldHtml}
        <p class="quiz-progress">${verseIndex + 1} / ${quiz.verses.length} 절</p>
        <div class="quiz-verse-text">
          <span class="num" style="color:var(--gold-deep); font-weight:700; margin-right:6px;">${escapeHtml(verse.verseLabel)}</span>
          ${bodyHtml}
        </div>
        <p class="quiz-verse-feedback" id="quiz-verse-feedback"></p>
        <div class="quiz-hint-box" id="quiz-hint-box"></div>
        <div class="quiz-btn-row">
          <button type="button" class="btn btn--gold" id="quiz-check-btn">채점하기</button>
        </div>
      </div>`;

    $('#quiz-check-btn').addEventListener('click', () => checkVerse(verse));
  }

  // 정답 비교: 공백 제거 후 단순 일치 비교
  function isCorrect(given, answer) {
    return (given || '').trim() === (answer || '').trim();
  }

  async function checkVerse(verse) {
    // 첫 번째 절이면, 채점하기 전에 먼저 이름을 확인합니다.
    if (verseIndex === 0 && !participantName) {
      const nameInput = $('#quiz-name-input');
      const noticeEl = $('#quiz-name-notice');
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        nameInput.style.borderColor = '#b3413a';
        noticeEl.textContent = '이름을 먼저 입력해주세요.';
        return;
      }

      const checkBtn = $('#quiz-check-btn');
      const originalLabel = checkBtn.textContent;
      checkBtn.disabled = true;
      checkBtn.textContent = '이름 확인 중...';
      const alreadyJoined = await hasAlreadyParticipated(name);
      checkBtn.disabled = false;
      checkBtn.textContent = originalLabel;

      if (alreadyJoined) {
        nameInput.style.borderColor = '#b3413a';
        noticeEl.textContent = '이미 이 이름으로 참여하셨어요. 동명이인이시면 이름 뒤에 구분(예: 홍길동2)을 붙여서 다시 시도해주세요.';
        return;
      }

      participantName = name;
      nameInput.disabled = true;
      nameInput.style.borderColor = '';
      noticeEl.textContent = '';
    }

    const inputs = $$('.quiz-blank-input', mainEl);
    const feedbackEl = $('#quiz-verse-feedback');
    let allDone = true;
    let anyWrong = false;

    inputs.forEach((input) => {
      if (input.disabled) return; // 이미 정답 확정된 칸은 건드리지 않음
      const blankId = input.dataset.blankId;
      const blank = verse.blanks.find((b) => b.id === blankId);
      const given = input.value;
      const ok = isCorrect(given, blank.answer);

      recordBlankAttempt(verse.id, blankId, ok);

      if (ok) {
        input.classList.add('correct');
        input.classList.remove('wrong');
        input.disabled = true;
      } else {
        input.classList.add('wrong');
        input.disabled = true; // '다시 풀기'를 누르기 전까지는 못 고치도록 잠급니다
        anyWrong = true;
        allDone = false;
      }
    });

    if (allDone) {
      feedbackEl.textContent = '정답입니다! 🎉';
      feedbackEl.className = 'quiz-verse-feedback ok';
      $('#quiz-check-btn').textContent = '다음 절로';
      $('#quiz-check-btn').onclick = goToNextVerse;
    } else if (anyWrong) {
      feedbackEl.textContent = '아쉬워요.';
      feedbackEl.className = 'quiz-verse-feedback retry';
      $('#quiz-check-btn').style.display = 'none';
      showRetryOptions(verse);
    }
  }

  // 틀린 빈칸이 하나라도 있으면, 피드백 문구 바로 아래에 버튼 두 개만 공통으로 둡니다.
  // (빈칸마다 각각 버튼을 붙이지 않고, 절 전체 기준으로 한 번에 처리)
  function showRetryOptions(verse) {
    const existing = $('#quiz-retry-actions');
    if (existing) existing.remove();

    const row = document.createElement('div');
    row.id = 'quiz-retry-actions';
    row.className = 'quiz-blank-retry-row';
    row.style.display = 'flex';
    row.style.marginBottom = '16px';
    row.innerHTML = `
      <button type="button" class="hint-btn">힌트 보고 다시 풀기</button>
      <button type="button" class="skip-btn">다음 넘어가기</button>`;
    $('#quiz-verse-feedback').insertAdjacentElement('afterend', row);

    row.querySelector('.hint-btn').addEventListener('click', () => {
      const hintBox = $('#quiz-hint-box');
      hintBox.textContent = `${verse.verseLabel}절 원문: ${verse.fullText}`;
      hintBox.classList.add('open');

      $$('.quiz-blank-input.wrong', mainEl).forEach((input) => {
        markHintUsed(verse.id, input.dataset.blankId);
        input.value = '';
        input.classList.remove('wrong');
        input.disabled = false;
      });

      row.remove();
      $('#quiz-verse-feedback').textContent = '다시 풀어보세요.';
      $('#quiz-verse-feedback').className = 'quiz-verse-feedback retry';
      const btn = $('#quiz-check-btn');
      btn.style.display = '';
      btn.textContent = '다시 채점하기';
      btn.onclick = () => checkVerse(verse);
      const firstWrong = $('.quiz-blank-input:not([disabled])', mainEl);
      if (firstWrong) firstWrong.focus();
    });

    row.querySelector('.skip-btn').addEventListener('click', () => {
      $$('.quiz-blank-input.wrong', mainEl).forEach((input) => {
        finalizeSkippedBlank(verse.id, input.dataset.blankId);
      });
      row.remove();
      const feedbackEl = $('#quiz-verse-feedback');
      feedbackEl.textContent = '이 절을 마쳤어요.';
      feedbackEl.className = 'quiz-verse-feedback ok';
      const btn = $('#quiz-check-btn');
      btn.style.display = '';
      btn.textContent = '다음 절로';
      btn.onclick = goToNextVerse;
    });
  }

  function goToNextVerse() {
    verseIndex += 1;
    if (verseIndex >= quiz.verses.length) {
      finishQuiz();
    } else {
      renderVerseStep();
    }
  }

  // ---------------- 시도 기록 ----------------
  function getVerseResult(verseId) {
    let vr = verseResults.find((v) => v.verseId === verseId);
    if (!vr) {
      vr = { verseId, blanks: [] };
      verseResults.push(vr);
    }
    return vr;
  }

  function getBlankResult(verseId, blankId) {
    const vr = getVerseResult(verseId);
    let br = vr.blanks.find((b) => b.blankId === blankId);
    if (!br) {
      br = { blankId, correct: false, firstTry: true, usedHint: false, attempts: 0 };
      vr.blanks.push(br);
    }
    return br;
  }

  function recordBlankAttempt(verseId, blankId, correct) {
    const br = getBlankResult(verseId, blankId);
    if (br.correct) return; // 이미 정답 확정된 칸은 재기록하지 않음
    br.attempts += 1;
    if (br.attempts > 1) br.firstTry = false;
    br.correct = correct;
  }

  function markHintUsed(verseId, blankId) {
    const br = getBlankResult(verseId, blankId);
    br.usedHint = true;
    br.firstTry = false; // 힌트를 본 이상 '한 번에 맞춘 것'으로 안 침
  }

  function finalizeSkippedBlank(verseId, blankId) {
    const br = getBlankResult(verseId, blankId);
    br.correct = false;
    br.firstTry = false;
  }

  // ---------------- 3단계: 결과 ----------------
  function badgeFor(percent) {
    if (percent >= 90) return { label: '말씀 박사 🏆', color: '#c9a227' };
    if (percent >= 70) return { label: '은혜의 지식 📖', color: '#8f6b17' };
    if (percent >= 50) return { label: '성실한 도전자 🌱', color: '#4a7a4a' };
    return { label: '다음 주 다시 도전! 💪', color: '#6b6a63' };
  }

  async function finishQuiz() {
    const totalBlanks = totalBlankCount();
    const perBlankPoint = totalBlanks > 0 ? 100 / totalBlanks : 0;

    let correctCount = 0;
    let firstTryCount = 0;
    verseResults.forEach((vr) => {
      vr.blanks.forEach((b) => {
        if (b.correct) {
          correctCount += 1;
          if (b.firstTry) firstTryCount += 1;
        }
      });
    });

    const score = Math.round(correctCount * perBlankPoint);
    const badge = badgeFor(score);

    mainEl.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-result-score">
          <div class="num">${score}<span style="font-size:1.4rem;">점</span></div>
          <div class="quiz-result-badge" style="background:${badge.color}22; color:${badge.color};">${badge.label}</div>
        </div>
        <p style="text-align:center; color:var(--muted); font-size:0.9rem;">
          총 ${totalBlanks}칸 중 ${correctCount}칸 정답 (한 번에 맞힌 칸 ${firstTryCount}개)
        </p>
        <p style="text-align:center; color:var(--muted); font-size:0.85rem;">참여해주셔서 감사해요, ${escapeHtml(participantName)}님!</p>
        <div style="text-align:center; margin-top:20px;">
          <a href="/#qt" class="btn btn--navy">홈으로</a>
        </div>
      </div>`;
    scrollQuizTop();

    try {
      await fetch(`/api/quiz/${quiz.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: participantName,
          score,
          correctCount,
          totalBlanks,
          firstTryCount
        })
      });
      loadLeaderboard();
    } catch (err) {
      // 순위표 갱신이 실패해도 결과 화면 자체는 이미 보여준 상태라 조용히 넘어갑니다.
    }
  }

  // ---------------- 참여자 순위 ----------------
  async function loadLeaderboard() {
    const el = $('#quiz-leaderboard');
    if (!quiz) return;
    try {
      const res = await fetch(`/api/quiz/${quiz.id}/leaderboard`);
      const list = await res.json();
      if (!list || list.length === 0) {
        el.innerHTML = `<p class="quiz-empty">아직 참여자가 없어요.</p>`;
        return;
      }
      el.innerHTML = list
        .slice(0, 20)
        .map(
          (p, i) => `
          <div class="quiz-leaderboard-row">
            <span class="rank">${i + 1}</span>
            <span class="name">${escapeHtml(p.name)}</span>
            <span class="score">${p.score}점</span>
          </div>`
        )
        .join('');
    } catch (err) {
      el.innerHTML = `<p class="quiz-empty">순위를 불러오지 못했습니다.</p>`;
    }
  }

  init();
})();
