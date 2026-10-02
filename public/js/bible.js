// 성경 읽기 페이지(public/bible.html) 전용 스크립트입니다.
// - 책 목록/본문은 서버의 /api/bible/* 에서 받아옵니다(본문 데이터는 서버가 시작할 때
//   딱 한 번만 메모리에 올려두므로 매번 파일을 다시 읽지 않습니다 — utils/bible.js 참고).
// - 오늘의 큐티·주일 설교의 "이 말씀 성경에서 읽기" 버튼은 이 페이지를
//   /bible.html?ref=요한복음%203장%2016절 형태로 열어주고, 이 페이지가 그 원문 그대로를
//   서버(/api/bible/resolve)에 다시 보내 실제 책/장/절로 바꿔서 그 자리로 이동합니다.
//   (문자열 해석 규칙을 이 파일과 서버 두 곳에 따로 유지하지 않기 위해 항상 서버에 물어봅니다)
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from((root || document).querySelectorAll(sel));

  function escapeHtml(str = '') {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  $('#bible-year') && ($('#bible-year').textContent = new Date().getFullYear());

  fetch('/api/site')
    .then((res) => res.json())
    .then((site) => {
      if (site && site.churchName) {
        document.title = `${document.title} | ${site.churchName}`;
        // 헤더 로고(이미지)가 #bible-brand(<a>) 안에 함께 들어있어서, 예전처럼
        // #bible-brand.textContent로 통째로 덮어쓰면 로고 이미지까지 지워집니다.
        // 그래서 글자만 담긴 #bible-brand-text(<span>)만 따로 갱신합니다.
        const brandTextEl = $('#bible-brand-text');
        if (brandTextEl) brandTextEl.textContent = site.churchName;
        else $('#bible-brand').textContent = site.churchName;
        $('#bible-footer-name').textContent = site.churchName;
      }
    })
    .catch(() => {});

  // ---------------- 상태 ----------------
  let booksIndex = []; // [{book, code, name, testament, chapters}, ...]
  let activeTestament = 'OT';
  let currentBook = null; // booksIndex의 항목 하나
  let currentChapter = 1;
  let currentVerses = []; // [{verse, text}, ...]
  let highlightRange = null; // {start, end} - 딥링크로 들어왔을 때 강조할 절 범위

  const FONT_STEPS = [
    { key: 'sm', label: '작게', size: '17px' },
    { key: 'md', label: '보통', size: '20px' },
    { key: 'lg', label: '크게', size: '24px' },
    { key: 'xl', label: '아주 크게', size: '29px' }
  ];
  let fontStepIndex = 1; // 기본값: 보통

  // ---------------- 글자 크기 조절 (어르신 배려 기능) ----------------
  function applyFontStep() {
    const step = FONT_STEPS[fontStepIndex];
    document.documentElement.style.setProperty('--bible-font-size', step.size);
    $('#bible-font-label').textContent = step.label;
    $('#bible-font-smaller').disabled = fontStepIndex === 0;
    $('#bible-font-bigger').disabled = fontStepIndex === FONT_STEPS.length - 1;
    try {
      localStorage.setItem('bibleFontStep', String(fontStepIndex));
    } catch (e) {
      // 시크릿 모드 등에서 저장이 막혀 있어도 화면 표시 자체엔 문제 없으므로 조용히 넘어갑니다.
    }
  }

  try {
    const saved = parseInt(localStorage.getItem('bibleFontStep'), 10);
    if (!Number.isNaN(saved) && saved >= 0 && saved < FONT_STEPS.length) fontStepIndex = saved;
  } catch (e) {}

  $('#bible-font-smaller').addEventListener('click', () => {
    if (fontStepIndex > 0) { fontStepIndex -= 1; applyFontStep(); }
  });
  $('#bible-font-bigger').addEventListener('click', () => {
    if (fontStepIndex < FONT_STEPS.length - 1) { fontStepIndex += 1; applyFontStep(); }
  });
  applyFontStep();

  // ---------------- 신/구약 탭 ----------------
  function setActiveTestament(t) {
    activeTestament = t;
    $('#bible-tab-ot').classList.toggle('is-active', t === 'OT');
    $('#bible-tab-nt').classList.toggle('is-active', t === 'NT');
    renderBookGrid();
  }
  $('#bible-tab-ot').addEventListener('click', () => setActiveTestament('OT'));
  $('#bible-tab-nt').addEventListener('click', () => setActiveTestament('NT'));

  // ---------------- 책 선택 모달 ----------------
  function renderBookGrid() {
    const grid = $('#bible-book-grid');
    const list = booksIndex.filter((b) => b.testament === activeTestament);
    grid.innerHTML = list
      .map(
        (b) => `<button type="button" class="bible-book-grid-item${currentBook && currentBook.code === b.code ? ' is-active' : ''}" data-code="${b.code}">${escapeHtml(b.name)}</button>`
      )
      .join('');
    $$('.bible-book-grid-item', grid).forEach((btn) => {
      btn.addEventListener('click', () => {
        const book = booksIndex.find((b) => b.code === btn.dataset.code);
        if (book) {
          closeBookModal();
          loadChapter(book, 1);
        }
      });
    });
  }

  function openBookModal() {
    // 예전엔 여기서 항상 "지금 읽고 있는 책의 신/구약"으로 되돌려버려서, 사용자가
    // 방금 누른 "신약" 탭이 모달을 열자마자 무시되고 구약으로 되돌아가는 문제가 있었습니다.
    // 이제는 사용자가 마지막으로 누른 탭(activeTestament)을 그대로 존중합니다.
    renderBookGrid();
    $('#bible-book-modal').classList.add('open');
    $('#bible-book-btn').setAttribute('aria-expanded', 'true');
  }
  function closeBookModal() {
    $('#bible-book-modal').classList.remove('open');
    $('#bible-book-btn').setAttribute('aria-expanded', 'false');
  }
  $('#bible-book-btn').addEventListener('click', openBookModal);
  $('#bible-book-modal-close').addEventListener('click', closeBookModal);
  $('#bible-book-modal').addEventListener('click', (e) => {
    if (e.target.id === 'bible-book-modal') closeBookModal();
  });

  // ---------------- 장 선택 드롭다운 ----------------
  function renderChapterSelect() {
    const select = $('#bible-chapter-select');
    if (!currentBook) { select.innerHTML = ''; return; }
    const opts = [];
    for (let i = 1; i <= currentBook.chapters; i++) {
      opts.push(`<option value="${i}"${i === currentChapter ? ' selected' : ''}>${i}장</option>`);
    }
    select.innerHTML = opts.join('');
  }
  $('#bible-chapter-select').addEventListener('change', (e) => {
    if (currentBook) loadChapter(currentBook, parseInt(e.target.value, 10));
  });

  // ---------------- 본문 불러오기 ----------------
  function loadChapter(book, chapter, verseHighlight) {
    stopSpeaking();
    highlightRange = verseHighlight || null;
    $('#bible-loading').style.display = 'block';
    $('#bible-chapter-head').hidden = true;
    $('#bible-verses').innerHTML = '';

    fetch(`/api/bible/${book.code}/${chapter}`)
      .then((res) => {
        if (!res.ok) throw new Error('불러오기 실패');
        return res.json();
      })
      .then((data) => {
        currentBook = booksIndex.find((b) => b.code === data.code) || book;
        currentChapter = data.chapter;
        currentVerses = data.verses;

        // 지금 펼친 책이 구약/신약 중 어느 쪽인지에 맞춰 상단 탭 표시도 함께 맞춰줍니다
        // (딥링크로 신약 본문을 바로 열었을 때도 탭이 "구약"에 멈춰 있던 문제 방지).
        if (currentBook.testament && currentBook.testament !== activeTestament) {
          activeTestament = currentBook.testament;
          $('#bible-tab-ot').classList.toggle('is-active', activeTestament === 'OT');
          $('#bible-tab-nt').classList.toggle('is-active', activeTestament === 'NT');
        }

        $('#bible-book-btn-label').textContent = currentBook.name;
        renderChapterSelect();
        renderVerses();

        $('#bible-chapter-title').textContent = `${currentBook.name} ${currentChapter}장`;
        $('#bible-chapter-head').hidden = false;
        $('#bible-loading').style.display = 'none';

        $('#bible-prev-chapter').disabled = currentChapter <= 1;
        $('#bible-next-chapter').disabled = currentChapter >= currentBook.chapters;

        // 주소창에도 지금 보고 있는 위치를 남겨서(뒤로가기·새로고침·공유 대비), 큐티/설교
        // 스마트 연동 버튼이 만든 링크와 같은 형식(b/c/v)으로 통일합니다.
        const params = new URLSearchParams();
        params.set('b', currentBook.code);
        params.set('c', String(currentChapter));
        if (highlightRange) {
          params.set('v', highlightRange.end && highlightRange.end !== highlightRange.start
            ? `${highlightRange.start}-${highlightRange.end}` : String(highlightRange.start));
        }
        history.replaceState(null, '', `/bible.html?${params.toString()}`);

        // 로그인 중이라면, 지금 펼친 장을 "마지막으로 읽은 곳"으로 서버에 저장합니다.
        recordReadingProgress(currentBook, currentChapter, highlightRange ? highlightRange.start : null);

        if (highlightRange) {
          setTimeout(() => {
            const target = $(`.bible-verse[data-verse="${highlightRange.start}"]`);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 60);
        } else {
          window.scrollTo({ top: $('.bible-toolbar').getBoundingClientRect().top + window.scrollY - 12, behavior: 'smooth' });
        }
      })
      .catch(() => {
        $('#bible-loading').textContent = '본문을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
      });
  }

  function renderVerses() {
    const wrap = $('#bible-verses');
    wrap.innerHTML = currentVerses
      .map((v) => {
        const isHighlighted = highlightRange && v.verse >= highlightRange.start && v.verse <= (highlightRange.end || highlightRange.start);
        return `<p class="bible-verse${isHighlighted ? ' is-highlighted' : ''}" data-verse="${v.verse}"><span class="bible-verse-num">${v.verse}</span>${escapeHtml(v.text)}</p>`;
      })
      .join('');
  }

  $('#bible-prev-chapter').addEventListener('click', () => {
    if (currentBook && currentChapter > 1) loadChapter(currentBook, currentChapter - 1);
  });
  $('#bible-next-chapter').addEventListener('click', () => {
    if (currentBook && currentChapter < currentBook.chapters) loadChapter(currentBook, currentChapter + 1);
  });

  // ---------------- 음성으로 듣기 (Web Speech API) ----------------
  // 브라우저 내장 무료 음성을 사용합니다. 기기/브라우저마다 목소리 품질과 톤이 다를 수
  // 있습니다. 절 번호(예: "3")는 어색하게 읽히므로 건너뛰고 본문만 이어서 읽습니다.
  let isSpeaking = false;
  let speakQueueIndex = 0;

  function pickKoreanVoice() {
    const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    return voices.find((v) => v.lang === 'ko-KR') || voices.find((v) => v.lang && v.lang.startsWith('ko')) || null;
  }

  function speakNext() {
    if (!isSpeaking) return;
    if (speakQueueIndex >= currentVerses.length) {
      stopSpeaking();
      return;
    }
    const verse = currentVerses[speakQueueIndex];
    $$('.bible-verse', $('#bible-verses')).forEach((el) => el.classList.remove('is-speaking'));
    const el = $(`.bible-verse[data-verse="${verse.verse}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el) el.classList.add('is-speaking');

    const utter = new SpeechSynthesisUtterance(verse.text);
    utter.lang = 'ko-KR';
    const voice = pickKoreanVoice();
    if (voice) utter.voice = voice;
    utter.rate = 0.95;
    utter.onend = () => {
      speakQueueIndex += 1;
      speakNext();
    };
    utter.onerror = () => {
      speakQueueIndex += 1;
      speakNext();
    };
    window.speechSynthesis.speak(utter);
  }

  function startSpeaking() {
    if (!window.speechSynthesis || currentVerses.length === 0) return;
    window.speechSynthesis.cancel();
    isSpeaking = true;
    speakQueueIndex = 0;
    $('#bible-listen-icon').textContent = '⏸';
    $('#bible-listen-label').textContent = '정지';
    speakNext();
  }

  function stopSpeaking() {
    isSpeaking = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    $$('.bible-verse', $('#bible-verses')).forEach((el) => el.classList.remove('is-speaking'));
    $('#bible-listen-icon').textContent = '🔊';
    $('#bible-listen-label').textContent = '듣기';
  }

  $('#bible-listen-btn').addEventListener('click', () => {
    if (!('speechSynthesis' in window)) {
      alert('이 브라우저에서는 음성 읽기 기능을 지원하지 않습니다.');
      return;
    }
    if (isSpeaking) stopSpeaking();
    else startSpeaking();
  });

  // 페이지를 벗어나거나 숨겨질 때 음성이 계속 재생되지 않도록 정리합니다.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopSpeaking();
  });

  // ---------------- 카카오 로그인 + 읽기 기록 ----------------
  // "지금 로그인되어 있는가"와 "지금까지 읽은 장 수"는 여러 함수(시작 시 이어읽기,
  // 장을 펼칠 때마다 기록 저장, 계정 표시줄 갱신)에서 함께 써야 해서 상태로 둡니다.
  let kakaoConfig = null; // { enabled, jsKey, redirectUri }
  let isLoggedIn = false;
  let readCount = 0;
  let readChaptersList = []; // ["GEN-1", "GEN-2", ...] - 성경읽기표 계산용

  function updateAccountBar() {
    const bar = $('#bible-account-bar');
    const loginBtn = $('#bible-login-btn');
    const info = $('#bible-account-info');
    if (!kakaoConfig || !kakaoConfig.enabled) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    if (isLoggedIn) {
      loginBtn.hidden = true;
      info.hidden = false;
      $('#bible-account-progress').textContent = readCount > 0 ? `지금까지 ${readCount}장 읽으셨어요` : '읽은 장을 기록해 보세요';
    } else {
      loginBtn.hidden = false;
      info.hidden = true;
    }
  }

  // ---------------- 성경읽기표 (66권 중 어디를 얼마나 읽었는지 한눈에 보기) ----------------
  // 책 줄을 누르면 그 책의 1장~마지막 장 칸이 펼쳐지고, 읽은 장은 색이 채워집니다.
  // 칸을 눌러 직접 읽음/해제할 수 있어서, 종이 성경 등으로 따로 읽은 장도 표시할 수 있습니다.
  let expandedChartBook = null;

  function renderReadingChart() {
    const total = booksIndex.length;
    const readBookCount = booksIndex.filter((b) => countReadChapters(b) > 0).length;
    const completeBookCount = booksIndex.filter((b) => countReadChapters(b) >= b.chapters).length;
    $('#bible-progress-summary').textContent =
      `총 ${total}권 중 ${readBookCount}권을 읽기 시작하셨고, 그중 ${completeBookCount}권을 완독하셨어요. ` +
      '책을 누르면 장별로 보이고, 칸을 눌러 읽음을 직접 표시하거나 지울 수 있어요.';

    $('#bible-progress-list-ot').innerHTML = renderProgressRows('OT');
    $('#bible-progress-list-nt').innerHTML = renderProgressRows('NT');

    $$('.bible-progress-row', $('#bible-progress-modal')).forEach((row) => {
      row.addEventListener('click', () => {
        expandedChartBook = expandedChartBook === row.dataset.code ? null : row.dataset.code;
        renderReadingChart();
        const opened = $(`.bible-progress-item[data-code="${row.dataset.code}"]`);
        if (opened && expandedChartBook) opened.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    });
    $$('.bible-progress-detail .bible-ch-cell', $('#bible-progress-modal')).forEach((cell) => {
      cell.addEventListener('click', () => {
        const key = cell.dataset.key;
        const nowRead = !readChaptersList.includes(key);
        saveReadChapters([key], nowRead).then(renderReadingChart);
      });
    });
    $$('.bible-progress-open-btn', $('#bible-progress-modal')).forEach((btn) => {
      btn.addEventListener('click', () => {
        const book = booksIndex.find((b) => b.code === btn.dataset.code);
        if (!book) return;
        // 아직 안 읽은 첫 장부터 (다 읽었으면 1장)
        let ch = 1;
        for (let i = 1; i <= book.chapters; i++) {
          if (!readChaptersList.includes(`${book.code}-${i}`)) { ch = i; break; }
        }
        closeProgressModal();
        loadChapter(book, ch);
      });
    });
  }

  function countReadChapters(book) {
    const prefix = book.code + '-';
    return readChaptersList.filter((id) => id.startsWith(prefix)).length;
  }

  // 한 책의 장 칸들(1~N). opts.opened: 이번에 펼쳐 본 장(점선 테두리), opts.selected: 채워 보일 장
  function renderChapterCells(book, opts = {}) {
    const selected = opts.selected || new Set(readChaptersList);
    const opened = opts.opened || new Set();
    let html = '';
    for (let i = 1; i <= book.chapters; i++) {
      const key = `${book.code}-${i}`;
      const cls = ['bible-ch-cell'];
      if (selected.has(key)) cls.push('is-read');
      if (opened.has(key)) cls.push('is-opened');
      html += `<button type="button" class="${cls.join(' ')}" data-key="${key}" aria-pressed="${selected.has(key)}">${i}</button>`;
    }
    return `<div class="bible-ch-grid">${html}</div>`;
  }

  function renderProgressRows(testament) {
    return booksIndex
      .filter((b) => b.testament === testament)
      .map((b) => {
        const n = countReadChapters(b);
        const percent = Math.round((n / b.chapters) * 100);
        const done = n >= b.chapters;
        const expanded = expandedChartBook === b.code;
        return `
          <div class="bible-progress-item${expanded ? ' is-expanded' : ''}" data-code="${b.code}">
            <button type="button" class="bible-progress-row${done ? ' is-done' : ''}" data-code="${b.code}" aria-expanded="${expanded}">
              <span class="bible-progress-name">${escapeHtml(b.name)}${done ? ' ✓' : ''}</span>
              <span class="bible-progress-bar-track"><span class="bible-progress-bar-fill" style="width:${percent}%"></span></span>
              <span class="bible-progress-count">${n}/${b.chapters}장</span>
            </button>
            ${expanded ? `
              <div class="bible-progress-detail">
                ${renderChapterCells(b)}
                <button type="button" class="bible-progress-open-btn" data-code="${b.code}">${escapeHtml(b.name)} 읽으러 가기 →</button>
              </div>` : ''}
          </div>`;
      })
      .join('');
  }

  function openProgressModal() {
    renderReadingChart();
    $('#bible-progress-modal').classList.add('open');
  }
  function closeProgressModal() {
    $('#bible-progress-modal').classList.remove('open');
  }
  $('#bible-progress-btn').addEventListener('click', openProgressModal);
  $('#bible-progress-modal-close').addEventListener('click', closeProgressModal);
  $('#bible-progress-modal').addEventListener('click', (e) => {
    if (e.target.id === 'bible-progress-modal') closeProgressModal();
  });

  // 읽음 표시 저장 (추가: read=true / 해제: read=false). 화면 목록도 서버 결과로 맞춤
  function saveReadChapters(keys, read) {
    if (!keys.length) return Promise.resolve();
    // 화면에는 바로 반영(느린 인터넷에서도 눌림이 바로 보이게)
    const set = new Set(readChaptersList);
    keys.forEach((k) => (read ? set.add(k) : set.delete(k)));
    readChaptersList = [...set];
    readCount = readChaptersList.length;
    updateAccountBar();
    return fetch('/api/bible/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapters: keys, read })
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('저장 실패'))))
      .then((data) => {
        if (data && Array.isArray(data.readChapters)) {
          readChaptersList = data.readChapters;
          readCount = readChaptersList.length;
          updateAccountBar();
        }
      })
      .catch(() => {
        alert('읽음 기록을 저장하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');
      });
  }

  // ---------------- "읽은 장 확인하기" ----------------
  // 장을 펼치기만 해서는 읽음으로 기록하지 않고, 이번에 펼쳐 본 장들을 모아뒀다가
  // 성경 페이지를 떠날 때(또는 '읽기 마치기'를 누를 때) 실제로 읽었는지 물어봅니다.
  //   - 모두 읽었어요: 펼쳐 본 장 전부 기록
  //   - 부분 체크하기: 그 책의 전체 장이 보이고, 실제로 읽은 장만 골라서 기록
  //   - 기록하지 않기: 아무것도 기록하지 않음
  // 뒤로가기·창 닫기처럼 화면에서 물어볼 수 없는 방법으로 떠난 경우에는, 다음에 성경
  // 페이지를 열 때 "지난번에 펼쳐 보신 장"으로 다시 물어봅니다.
  const PENDING_KEY = 'biblePendingOpened';
  function loadPending() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]').filter((k) => typeof k === 'string'); } catch (e) { return []; }
  }
  function savePending(list) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch (e) {}
  }
  // 이번 방문 전에 남아 있던 확인 대기 목록 (페이지를 열자마자 따로 떼어둠)
  const previousPending = loadPending();
  savePending([]);
  let pendingOpened = []; // 이번 방문에서 펼쳐 본 장

  function addPending(key) {
    if (!pendingOpened.includes(key)) pendingOpened.push(key);
    savePending(pendingOpened);
  }
  function unreadOf(list) {
    return list.filter((k) => !readChaptersList.includes(k));
  }
  function clearPending() {
    pendingOpened = [];
    savePending([]);
  }

  // ["GEN-1","GEN-2","GEN-3","GEN-5"] → "창세기 1~3, 5장"
  function describeChapters(keys) {
    const byBook = new Map();
    keys.forEach((k) => {
      const [code, ch] = k.split('-');
      if (!byBook.has(code)) byBook.set(code, []);
      byBook.get(code).push(Number(ch));
    });
    const parts = [];
    booksIndex.forEach((b) => {
      const nums = byBook.get(b.code);
      if (!nums) return;
      nums.sort((a, c) => a - c);
      const ranges = [];
      let start = nums[0];
      let prev = nums[0];
      for (let i = 1; i <= nums.length; i++) {
        const n = nums[i];
        if (n === prev + 1) { prev = n; continue; }
        ranges.push(start === prev ? `${start}` : `${start}~${prev}`);
        start = n; prev = n;
      }
      parts.push(`${b.name} ${ranges.join(', ')}장`);
    });
    return parts.join(' · ');
  }

  let confirmState = null; // { keys, onDone, allowContinue, partialSelected }

  function openReadConfirm(keys, { onDone, allowContinue = false, previous = false } = {}) {
    const unread = unreadOf(keys);
    if (!unread.length) { if (onDone) onDone(); return; }
    confirmState = { keys: unread, onDone, allowContinue };
    $('#bible-confirm-title').textContent = previous ? '지난번에 펼쳐 보신 장을 확인해 주세요' : '오늘 읽으신 장을 기록할까요?';
    $('#bible-confirm-desc').innerHTML =
      `${previous ? '지난번에' : '이번에'} 펼쳐 보신 장: <strong>${escapeHtml(describeChapters(unread))}</strong> (${unread.length}장)<br>` +
      '장만 넘겨 보신 경우도 있으니, 실제로 읽으신 장만 기록해 주세요.';
    $('#bible-confirm-main').hidden = false;
    $('#bible-confirm-partial').hidden = true;
    $('#bible-confirm-continue').hidden = !allowContinue;
    $('#bible-confirm-modal').classList.add('open');
  }

  function finishReadConfirm() {
    $('#bible-confirm-modal').classList.remove('open');
    clearPending();
    const done = confirmState && confirmState.onDone;
    confirmState = null;
    if (done) done();
  }

  function showPartialCheck() {
    if (!confirmState) return;
    const opened = new Set(confirmState.keys);
    const codes = [...new Set(confirmState.keys.map((k) => k.split('-')[0]))];
    // 처음에는 이미 읽음으로 기록된 장만 채워 둠 → 실제로 읽은 장을 눌러서 채우면 됨
    confirmState.partialSelected = new Set(readChaptersList);
    const wrap = $('#bible-confirm-partial-books');
    wrap.innerHTML = booksIndex
      .filter((b) => codes.includes(b.code))
      .map((b) => `
        <div class="bible-confirm-book">
          <h4>${escapeHtml(b.name)} <span>(점선: 이번에 펼쳐 본 장)</span></h4>
          ${renderChapterCells(b, { opened, selected: confirmState.partialSelected })}
        </div>`)
      .join('');
    $$('.bible-ch-cell', wrap).forEach((cell) => {
      cell.addEventListener('click', () => {
        const key = cell.dataset.key;
        const sel = confirmState.partialSelected;
        if (sel.has(key)) sel.delete(key); else sel.add(key);
        cell.classList.toggle('is-read', sel.has(key));
        cell.setAttribute('aria-pressed', String(sel.has(key)));
      });
    });
    $('#bible-confirm-main').hidden = true;
    $('#bible-confirm-partial').hidden = false;
  }

  $('#bible-confirm-all').addEventListener('click', () => {
    if (!confirmState) return;
    saveReadChapters(confirmState.keys, true).finally(finishReadConfirm);
  });
  $('#bible-confirm-partial-btn').addEventListener('click', showPartialCheck);
  $('#bible-confirm-skip').addEventListener('click', finishReadConfirm);
  $('#bible-confirm-back').addEventListener('click', () => {
    $('#bible-confirm-main').hidden = false;
    $('#bible-confirm-partial').hidden = true;
  });
  $('#bible-confirm-save').addEventListener('click', () => {
    if (!confirmState) return;
    const sel = confirmState.partialSelected || new Set();
    const codes = new Set(confirmState.keys.map((k) => k.split('-')[0]));
    const before = new Set(readChaptersList.filter((k) => codes.has(k.split('-')[0])));
    const toAdd = [...sel].filter((k) => codes.has(k.split('-')[0]) && !before.has(k));
    const toRemove = [...before].filter((k) => !sel.has(k));
    Promise.all([saveReadChapters(toAdd, true), saveReadChapters(toRemove, false)]).finally(finishReadConfirm);
  });
  $('#bible-confirm-continue').addEventListener('click', () => {
    // 떠나지 않고 계속 읽기 (펼쳐 본 장 목록은 그대로 유지)
    $('#bible-confirm-modal').classList.remove('open');
    confirmState = null;
  });
  $('#bible-finish-btn').addEventListener('click', () => {
    const unread = unreadOf(pendingOpened);
    if (!unread.length) {
      alert('이번에 새로 펼쳐 보신 장이 없어요. 읽기표에서 장을 직접 체크할 수도 있어요.');
      return;
    }
    openReadConfirm(pendingOpened);
  });

  // 성경 페이지 밖으로 나가는 링크(홈으로, 상단 로고 등)를 누르면, 떠나기 전에 먼저 확인
  document.addEventListener('click', (e) => {
    if (!isLoggedIn || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#') || href.startsWith('javascript:')) return;
    let url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin === location.origin && url.pathname === location.pathname) return; // 같은 페이지 안 이동
    if (!unreadOf(pendingOpened).length) return;
    e.preventDefault();
    openReadConfirm(pendingOpened, { allowContinue: true, onDone: () => { location.href = a.href; } });
  }, true);

  function loadKakaoSdk() {
    return new Promise((resolve, reject) => {
      if (window.Kakao) { resolve(); return; }
      const s = document.createElement('script');
      // 버전은 카카오 개발자 사이트(디벨로퍼스 > 문서 > JavaScript > 다운로드)의 최신
      // 안정 버전을 따릅니다. 오래돼서 업데이트가 필요해지면 이 숫자만 바꾸면 됩니다.
      s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js';
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function setupKakaoLogin() {
    fetch('/api/bible/kakao-config')
      .then((res) => res.json())
      .then((cfg) => {
        kakaoConfig = cfg;
        if (!cfg.enabled) { updateAccountBar(); return; }
        loadKakaoSdk()
          .then(() => {
            if (!window.Kakao.isInitialized()) window.Kakao.init(cfg.jsKey);
            updateAccountBar();
          })
          .catch(() => { kakaoConfig = { enabled: false }; updateAccountBar(); });
      })
      .catch(() => {});
  }

  $('#bible-login-btn').addEventListener('click', () => {
    if (!kakaoConfig || !kakaoConfig.enabled || !window.Kakao || !window.Kakao.isInitialized()) return;
    // 로그인하러 가기 직전, 지금 보고 있던 장/절 위치(주소창 쿼리스트링)를 그대로 실어
    // 보내서, 로그인하고 돌아왔을 때 원래 보던 자리로 이어집니다.
    window.Kakao.Auth.authorize({
      redirectUri: kakaoConfig.redirectUri,
      state: encodeURIComponent(location.search || '')
    });
  });

  $('#bible-logout-btn').addEventListener('click', () => {
    // 화면만 바꾸고 실제 로그아웃 요청이 실패해도 모르고 지나가는 일이 없도록,
    // 응답 성공 여부를 확인하고 실패하면 알려줍니다. 성공하면 새로고침해서 서버가
    // 실제로 로그아웃 상태로 봤는지까지 확실하게 확인합니다.
    fetch('/api/bible/logout', { method: 'POST' })
      .then((res) => {
        if (!res.ok) throw new Error('로그아웃 요청 실패: ' + res.status);
        clearPending();
        location.reload();
      })
      .catch((err) => {
        console.error('로그아웃 실패:', err);
        alert('로그아웃에 실패했습니다. 잠시 후 다시 시도해주세요.');
      });
  });

  // 카카오 로그인 콜백이 실패했을 때(?kakaoError=1) 안내만 하고 조용히 지웁니다.
  (function handleKakaoErrorParam() {
    const params = new URLSearchParams(location.search);
    if (params.get('kakaoError') === '1') {
      params.delete('kakaoError');
      const rest = params.toString();
      history.replaceState(null, '', `/bible.html${rest ? '?' + rest : ''}`);
      alert('카카오 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  })();

  // 장을 펼칠 때마다(로그인 상태일 때만) 서버에 "마지막으로 읽던 곳"을 저장합니다.
  // 읽음 표시는 하지 않고, "이번에 펼쳐 본 장" 목록에만 넣어 두었다가 나중에 확인받습니다.
  function recordReadingProgress(book, chapter, verse) {
    if (!isLoggedIn) return;
    const key = `${book.code}-${chapter}`;
    if (!readChaptersList.includes(key)) addPending(key);
    fetch('/api/bible/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: book.code, chapter, verse: verse || null })
    }).catch(() => {});
  }

  // ---------------- 시작: 책 목록 + 로그인 상태를 함께 받아온 뒤, 위치를 정합니다 ----------------
  // 우선순위: ① 큐티/설교의 ref 딥링크 ② 주소창의 b/c/v ③ 로그인 상태라면 마지막으로
  // 읽던 곳 ④ 그 무엇도 없으면 창세기 1장.
  setupKakaoLogin();

  Promise.all([
    fetch('/api/bible/books').then((res) => res.json()),
    fetch('/api/bible/history').then((res) => (res.ok ? res.json() : { loggedIn: false }))
  ])
    .then(([booksData, historyData]) => {
      booksIndex = booksData.books || [];
      isLoggedIn = !!historyData.loggedIn;
      readCount = historyData.readCount || 0;
      readChaptersList = Array.isArray(historyData.readChapters) ? historyData.readChapters : [];
      updateAccountBar();
      if (isLoggedIn) {
        const nameEl = $('#bible-account-name');
        nameEl.textContent = historyData.nickname ? `${historyData.nickname}님, 안녕하세요` : '카카오 계정으로 로그인됨';
        // 지난번에 확인 없이 떠났던 장이 있으면 먼저 물어봄
        const validPrev = previousPending.filter((k) => booksIndex.some((b) => k.startsWith(b.code + '-')));
        if (unreadOf(validPrev).length) setTimeout(() => openReadConfirm(validPrev, { previous: true }), 400);
      } else {
        clearPending();
      }

      const params = new URLSearchParams(location.search);
      const refParam = params.get('ref'); // 큐티/설교 쪽에서 원문 그대로 넘어온 경우
      const bParam = params.get('b');
      const cParam = params.get('c');
      const vParam = params.get('v');

      if (refParam) {
        fetch(`/api/bible/resolve?ref=${encodeURIComponent(refParam)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((resolved) => {
            if (resolved) {
              const book = booksIndex.find((b) => b.code === resolved.code);
              if (book) {
                const hl = resolved.verseStart ? { start: resolved.verseStart, end: resolved.verseEnd || resolved.verseStart } : null;
                loadChapter(book, resolved.chapter, hl);
                return;
              }
            }
            loadStartingPoint(historyData);
          })
          .catch(() => loadStartingPoint(historyData));
        return;
      }

      if (bParam) {
        const book = booksIndex.find((b) => b.code === bParam.toUpperCase());
        if (book) {
          const chapter = parseInt(cParam, 10) || 1;
          let hl = null;
          if (vParam) {
            const vm = vParam.match(/^(\d+)(?:-(\d+))?$/);
            if (vm) hl = { start: parseInt(vm[1], 10), end: vm[2] ? parseInt(vm[2], 10) : parseInt(vm[1], 10) };
          }
          loadChapter(book, chapter, hl);
          return;
        }
      }

      loadStartingPoint(historyData);
    })
    .catch(() => {
      $('#bible-loading').textContent = '책 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
    });

  function loadStartingPoint(historyData) {
    // 딥링크가 없을 때: 로그인 중이고 마지막으로 읽던 곳이 있으면 그곳부터 이어서 보여주고,
    // 그마저 없으면(첫 방문 등) 창세기 1장부터 시작합니다.
    if (historyData && historyData.loggedIn && historyData.lastRead && historyData.lastRead.code) {
      const book = booksIndex.find((b) => b.code === historyData.lastRead.code);
      if (book) {
        loadChapter(book, historyData.lastRead.chapter || 1);
        return;
      }
    }
    loadDefaultBook();
  }

  function loadDefaultBook() {
    // 특별히 지정된 위치가 없으면 창세기 1장부터 시작합니다.
    const gen = booksIndex.find((b) => b.code === 'GEN');
    if (gen) loadChapter(gen, 1);
  }
})();
