const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { readData, writeData, updateData, makeId } = require('../utils/db');
const stats = require('../utils/stats');
const { getCachedSermons } = require('../utils/youtube');
const { buildAndCacheSermonPoster, pregenerateMissingSermonPosters, pickSermonPhotoSource } = require('../utils/sermonPoster');
const { VAPID_PUBLIC_KEY, saveSubscription, removeSubscription, sendTest } = require('../utils/push');
const bible = require('../utils/bible');
const { getKakaoIdFromReq, setLoginCookie, clearLoginCookie } = require('../utils/kakaoAuth');
const { exchangeCodeForToken, fetchKakaoUser } = require('../utils/kakao');
const { clientIp, limitRequests, failureGuard } = require('../utils/rateLimit');

// 비밀글 비밀번호 대입 방지: 같은 IP 또는 같은 글에 대해 15분 동안 8번 틀리면 잠시 잠금
const secretVerifyGuard = failureGuard({ name: 'secret-verify', max: 8, windowMs: 15 * 60 * 1000 });
const TEN_MIN = 10 * 60 * 1000;

const SITE_URL = process.env.SITE_URL || 'https://muldaen.com';
const KAKAO_REDIRECT_URI = `${SITE_URL}/api/bible/kakao/callback`;

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');

// ---------- 푸시 알림 구독 (공개) ----------
router.get('/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

router.post('/push/subscribe', limitRequests({ name: 'push-sub', max: 20, windowMs: TEN_MIN }), async (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: '잘못된 구독 정보입니다.' });
    }
    await saveSubscription(subscription);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 지금 이 기기(브라우저)로만 테스트 알림을 보냅니다. "알림이 안 온다"는 문의를
// 받았을 때, 그 사람의 기기에서 직접 눌러보게 해서 원인을 좁히기 위한 용도입니다.
router.post('/push/test', limitRequests({ name: 'push-test', max: 5, windowMs: TEN_MIN }), async (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: '잘못된 구독 정보입니다.' });
    }
    await sendTest(subscription, { title: '테스트 알림', body: '이 알림이 보이면 정상적으로 작동하고 있는 거예요 🎉' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/push/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) await removeSubscription(endpoint);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 컨셉B 전용: 가공(리사이즈·합성) 없이 목사님 사진 원본을 그대로 서빙합니다.
// 화면에 보여주는 용도라 공유 미리보기 이미지가 필요 없어서, 서버에서 이미지를
// 합성하는 무거운 작업 없이 사진+글씨를 CSS로 얹는 훨씬 빠른 방식을 씁니다.
router.get('/sermon-photo', (req, res) => {
  try {
    const { getBuiltinPhotoPaths } = require('../utils/sermonPoster');
    const photoPaths = getBuiltinPhotoPaths();
    if (!photoPaths.length) return res.status(404).end();
    const buffer = fs.readFileSync(photoPaths[0]);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Content-Type', 'image/jpeg');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sermon-poster/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
      return res.status(400).json({ error: '잘못된 영상 ID입니다.' });
    }
    const rawTitle = String(req.query.title || '').slice(0, 200);
    const idxRaw = Number(req.query.idx);
    const videoIndex = Number.isInteger(idxRaw) && idxRaw >= 0 ? idxRaw : null;
    const theme = req.query.theme === 'b' ? 'b' : 'a';
    const cacheKey = theme === 'b' ? `${videoId}_b` : videoId;

    const posters = (await readData('sermonPosters')) || {};
    const cached = posters[cacheKey];
    // 이 주소(래퍼) 자체는 브라우저가 마음대로 오래 캐싱하지 않도록 항상 no-cache로 표시합니다.
    // 실제 이미지 파일은 재생성될 때마다 고유한 파일명으로 저장되므로, 그 주소는 안전하게
    // 오래 캐싱돼도 됩니다. (예전엔 여기서 이미지를 직접 보내면서 1년짜리 캐시를 걸어버려서,
    // 서버에서 새로 만들어도 브라우저가 계속 예전 이미지를 쓰는 문제가 있었습니다)
    res.set('Cache-Control', 'no-cache');

    // 컨셉B는 지금 한창 디자인을 다듬는 중이라, 캐시를 아예 쓰지 않고 매번 새로 만듭니다.
    // (제목이 안 바뀌면 캐시를 그대로 쓰는 방식이라, 코드를 고쳐도 옛날 이미지가 계속
    // 재사용되는 혼란이 있었습니다. 컨셉B 디자인이 안정되면 다시 캐시를 쓰도록 되돌립니다.)
    if (theme !== 'b' && cached && cached.title === rawTitle && cached.url) {
      return res.redirect(cached.url);
    }

    const { url } = await buildAndCacheSermonPoster({ videoId, rawTitle, videoIndex, uploadsDir, theme });
    return res.redirect(url);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 이제 사진은 합성 없이 그대로 보여줍니다(제목·구절은 별도 칸에 표시). 영상마다 어떤
// 사진을 쓸지만 정해서, 로컬 파일이면 바로 전송하고 관리자가 올린 URL이면 그리로 넘겨줍니다.
router.get('/sermon-photo/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
      return res.status(400).json({ error: '잘못된 영상 ID입니다.' });
    }
    const site = (await readData('site')) || {};
    const extraPhotoUrls = Array.isArray(site.sermonCardPhotos) ? site.sermonCardPhotos : [];
    const photoOverride = site.sermonPhotoOverride || '';

    const source = pickSermonPhotoSource({ videoId, extraPhotoUrls, photoOverride });
    if (!source) return res.status(404).json({ error: '등록된 사진이 없습니다.' });

    res.set('Cache-Control', 'no-cache');
    if (source.type === 'url') return res.redirect(source.value);
    return res.sendFile(source.value);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/site', async (req, res) => {
  try { res.json(await readData('site')); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/menu', async (req, res) => {
  try {
    const menu = (await readData('menu')) || [];
    res.json([...menu].sort((a, b) => a.order - b.order));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/posts', async (req, res) => {
  try {
    const posts = (await readData('posts')) || [];
    res.json([...posts].sort((a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : new Date(b.date) - new Date(a.date))));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/posts/:id', async (req, res) => {
  try {
    const posts = (await readData('posts')) || [];
    const post = posts.find((p) => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/sermons', async (req, res) => {
  try {
    const data = await getCachedSermons();
    res.json(data);
    if (data && Array.isArray(data.videos)) pregenerateMissingSermonPosters(data.videos, uploadsDir);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/qt', async (req, res) => {
  try {
    const qt = (await readData('qt')) || [];
    res.json([...qt].sort((a, b) => new Date(b.date) - new Date(a.date)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/qt/:id', async (req, res) => {
  try {
    const qt = (await readData('qt')) || [];
    const item = qt.find((q) => q.id === req.params.id);
    if (!item) return res.status(404).json({ error: '큐티를 찾을 수 없습니다.' });
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/qt/:id/amen', limitRequests({ name: 'amen', max: 40, windowMs: TEN_MIN }), async (req, res) => {
  try {
    const delta = req.body.action === 'remove' ? -1 : 1;
    let amen = null;
    // 동시에 여러 명이 눌러도 숫자가 빠지지 않도록 차례대로 처리
    await updateData('qt', (qt) => {
      const list = qt || [];
      const item = list.find((q) => q.id === req.params.id);
      if (!item) return undefined; // 저장하지 않음
      item.amen = Math.max(0, (item.amen || 0) + delta);
      amen = item.amen;
      return list;
    });
    if (amen === null) return res.status(404).json({ error: '큐티를 찾을 수 없습니다.' });
    res.json({ amen });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- 목회 칼럼 (공개) ----------
router.get('/column', async (req, res) => {
  try {
    const columns = (await readData('columns')) || [];
    res.json([...columns].sort((a, b) => new Date(b.date) - new Date(a.date)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/column/:id', async (req, res) => {
  try {
    const columns = (await readData('columns')) || [];
    const item = columns.find((c) => c.id === req.params.id);
    if (!item) return res.status(404).json({ error: '칼럼을 찾을 수 없습니다.' });
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- 성경 리더 (공개) ----------
// 본문 출처: 대한성서공회 개역한글판(1961) — 저작권 보호기간 만료로 공개도메인.
// utils/bible.js가 서버 시작 시 본문 전체를 메모리에 올려두므로, 아래 라우트들은
// 파일을 다시 읽지 않고 바로 응답합니다.

// 신/구약 책 목록(장 수 포함) — 책 선택 UI에서 사용
router.get('/bible/books', (req, res) => {
  try {
    res.json({ source: bible.SOURCE_NOTICE, books: bible.getBooksIndex() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// "요한복음 3장 16절" 같은 표기를 실제 책/장/절 좌표로 변환합니다. 오늘의 큐티·주일
// 설교의 "이 말씀 성경에서 읽기" 스마트 연동 버튼이 사용합니다.
router.get('/bible/resolve', (req, res) => {
  try {
    const ref = String(req.query.ref || '');
    const resolved = bible.parseVerseRef(ref);
    if (!resolved) return res.status(404).json({ error: '구절 표기를 인식하지 못했습니다.' });
    res.json(resolved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 성경 리더: 카카오 로그인 + 읽기 기록(2단계) ----------
// 흐름: 클라이언트가 /bible/kakao-config로 JavaScript 키를 받아 카카오 SDK를 초기화
// → "카카오로 로그인" 버튼 클릭 시 Kakao.Auth.authorize()가 카카오 로그인 화면으로
// 이동 → 로그인 완료 후 카카오가 이 서버의 /bible/kakao/callback으로 "인가 코드"를
// 담아 돌려보냄 → 여기서 그 코드를 실제 토큰으로 바꾸고, 토큰으로 회원번호(고유 id)를
// 받아와 자체 서명 쿠키(utils/kakaoAuth.js)를 심어줌 → 이후 요청은 그 쿠키로 신원을
// 확인해 utils/db.js의 'bibleHistory' 데이터에서 그 사람의 읽기 기록을 읽고 씁니다.

// 브라우저에 안전하게 내려줘도 되는 값만 전달합니다 (REST API 키·Client Secret은 절대 포함 안 함).
router.get('/bible/kakao-config', (req, res) => {
  res.json({
    enabled: !!(process.env.KAKAO_JS_KEY && process.env.KAKAO_REST_API_KEY),
    jsKey: process.env.KAKAO_JS_KEY || '',
    redirectUri: KAKAO_REDIRECT_URI
  });
});

// 카카오 로그인 완료 후 카카오 서버가 사용자를 이 주소로 돌려보냅니다.
router.get('/bible/kakao/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.redirect('/bible.html?kakaoError=1');

    const accessToken = await exchangeCodeForToken(code, KAKAO_REDIRECT_URI);
    const user = await fetchKakaoUser(accessToken);
    const kakaoId = String(user.id);
    const nickname =
      (user.kakao_account && user.kakao_account.profile && user.kakao_account.profile.nickname) || '';

    const history = (await readData('bibleHistory')) || { users: {} };
    if (!history.users) history.users = {};
    if (!history.users[kakaoId]) history.users[kakaoId] = {};
    if (nickname) history.users[kakaoId].nickname = nickname;
    history.users[kakaoId].lastLoginAt = new Date().toISOString();
    await writeData('bibleHistory', history);

    setLoginCookie(res, kakaoId);

    // 로그인하기 직전 보고 있던 장/절 위치(state)로 그대로 돌아갑니다.
    let back = '';
    if (state) {
      try {
        back = decodeURIComponent(state);
        if (!back.startsWith('?')) back = ''; // 이상한 값이 섞여 들어오는 걸 방지
      } catch (e) {
        back = '';
      }
    }
    res.redirect(`/bible.html${back}`);
  } catch (err) {
    console.error('카카오 로그인 실패:', err.message);
    res.redirect('/bible.html?kakaoError=1');
  }
});

router.post('/bible/logout', (req, res) => {
  clearLoginCookie(res);
  res.json({ ok: true });
});

// 로그인한 사람의 현재 기록(마지막으로 읽던 위치, 총 읽은 장 수)을 돌려줍니다.
router.get('/bible/history', async (req, res) => {
  try {
    const kakaoId = getKakaoIdFromReq(req);
    if (!kakaoId) return res.json({ loggedIn: false });
    const history = (await readData('bibleHistory')) || { users: {} };
    const record = (history.users && history.users[kakaoId]) || {};
    res.json({
      loggedIn: true,
      nickname: record.nickname || '',
      lastRead: record.lastRead || null,
      readCount: Array.isArray(record.readChapters) ? record.readChapters.length : 0,
      // "성경읽기표"에서 책별로 몇 장 읽었는지 계산하려면 전체 목록이 필요해서 함께 내려줍니다.
      readChapters: Array.isArray(record.readChapters) ? record.readChapters : []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 장을 펼쳐볼 때마다 호출되어 "마지막으로 읽은 곳"과 "지금까지 읽은 장 수"를 갱신합니다.
router.post('/bible/history', async (req, res) => {
  try {
    const kakaoId = getKakaoIdFromReq(req);
    if (!kakaoId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { code, chapter, verse } = req.body || {};
    if (!code || !chapter) return res.status(400).json({ error: '잘못된 요청입니다.' });

    const history = (await readData('bibleHistory')) || { users: {} };
    if (!history.users) history.users = {};
    if (!history.users[kakaoId]) history.users[kakaoId] = {};
    const record = history.users[kakaoId];
    record.lastRead = { code, chapter, verse: verse || null, at: new Date().toISOString() };
    record.readChapters = Array.isArray(record.readChapters) ? record.readChapters : [];
    const key = `${code}-${chapter}`;
    if (!record.readChapters.includes(key)) record.readChapters.push(key);
    await writeData('bibleHistory', history);

    res.json({ ok: true, readCount: record.readChapters.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 특정 책의 한 장 본문 전체
router.get('/bible/:code/:chapter', (req, res) => {
  try {
    const book = bible.getBookByCode(req.params.code);
    if (!book) return res.status(404).json({ error: '해당 책을 찾을 수 없습니다.' });
    const chapterNum = parseInt(req.params.chapter, 10);
    const chapter = bible.getChapter(req.params.code, chapterNum);
    if (!chapter) return res.status(404).json({ error: '해당 장을 찾을 수 없습니다.' });
    res.json(chapter);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/track', limitRequests({ name: 'track', max: 600, windowMs: TEN_MIN }), (req, res) => {
  // 방문 통계는 요청마다 바로 저장하지 않고 서버 메모리에 모아뒀다가 30초마다 한 번에
  // 저장합니다(utils/stats.js). 통계 수집 실패가 화면에 영향을 주면 안 되므로 항상 조용히 응답.
  const ok = stats.record(req.body || {});
  if (!ok) return res.status(400).json({ error: '잘못된 요청입니다.' });
  res.json({ ok: true });
});

router.post('/receipt-requests', limitRequests({ name: 'receipt', max: 5, windowMs: 60 * 60 * 1000, message: '신청이 너무 많이 접수되었습니다. 잠시 후 다시 시도해주세요.' }), async (req, res) => {
  try {
    const { name, phone, email, note } = req.body;
    if (!name || !phone) return res.status(400).json({ error: '이름과 연락처를 입력해주세요.' });
    const requests = (await readData('receiptRequests')) || [];
    requests.unshift({
      id: 'rc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name, phone, email: email || '', note: note || '',
      createdAt: new Date().toISOString()
    });
    await writeData('receiptRequests', requests);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/missions', async (req, res) => {
  try { res.json((await readData('missions')) || []); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/partners', async (req, res) => {
  try { res.json((await readData('partners')) || []); } catch (err) { res.status(500).json({ error: err.message }); }
});

function createSecretBoardRouter(key, { requiredMessage }) {
  const board = express.Router();

  board.get('/', async (req, res) => {
    try {
      const items = (await readData(key)) || [];
      const sorted = [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.json(
        sorted.map((p) => ({
          id: p.id, name: p.name || '익명', date: p.date, secret: !!p.secret,
          content: p.secret ? '' : p.content, hasReply: !!(p.reply && p.reply.trim())
        }))
      );
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  board.post('/', async (req, res) => {
    try {
      const { name, content, secret, password } = req.body;
      if (!content || !content.trim()) return res.status(400).json({ error: requiredMessage });
      if (secret && (!password || String(password).length < 4)) {
        return res.status(400).json({ error: '비밀글은 4자 이상의 비밀번호를 설정해주세요.' });
      }
      const items = (await readData(key)) || [];
      const item = {
        id: key.slice(0, 2) + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: (name || '').trim().slice(0, 30),
        content: content.trim().slice(0, 2000),
        secret: !!secret,
        passwordHash: secret ? bcrypt.hashSync(String(password), 8) : null,
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString()
      };
      items.unshift(item);
      await writeData(key, items);
      res.json({ ok: true, id: item.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  board.post('/:id/verify', async (req, res) => {
    try {
      const { password } = req.body;
      const items = (await readData(key)) || [];
      const item = items.find((p) => p.id === req.params.id);
      if (!item) return res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
      if (!item.secret) {
        return res.json({ ok: true, content: item.content, name: item.name, date: item.date, reply: item.reply || '' });
      }
      const guardKeys = [`ip:${clientIp(req)}`, `post:${key}:${item.id}`];
      const lockedMin = secretVerifyGuard.isLocked(guardKeys);
      if (lockedMin) {
        return res.status(429).json({ error: `비밀번호를 여러 번 틀려 잠시 확인이 제한되었습니다. ${lockedMin}분 후에 다시 시도해주세요.` });
      }
      const valid = item.passwordHash && bcrypt.compareSync(String(password || ''), item.passwordHash);
      if (!valid) {
        secretVerifyGuard.fail(guardKeys);
        return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
      }
      res.json({ ok: true, content: item.content, name: item.name, date: item.date, reply: item.reply || '' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return board;
}

router.get('/quiz/current', async (req, res) => {
  try {
    const quizzes = (await readData('quizzes')) || [];
    if (quizzes.length === 0) return res.json(null);
    const latest = quizzes[quizzes.length - 1];
    res.json({
      id: latest.id, reference: latest.reference, weekLabel: latest.weekLabel,
      verses: latest.verses.map((v) => ({
        id: v.id, reference: v.reference || latest.reference, verseLabel: v.verseLabel, markedText: v.markedText, fullText: v.fullText,
        blanks: v.blanks.map((b) => ({ id: b.id, answer: b.answer }))
      }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/quiz/:id/submit', limitRequests({ name: 'quiz', max: 10, windowMs: TEN_MIN }), async (req, res) => {
  try {
    const quizzes = (await readData('quizzes')) || [];
    const quiz = quizzes.find((q) => q.id === req.params.id);
    if (!quiz) return res.status(404).json({ error: '퀴즈를 찾을 수 없습니다.' });
    const { name, score, correctCount, totalBlanks, firstTryCount } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '이름을 입력해주세요.' });
    const submissions = (await readData('quizSubmissions')) || [];
    const submission = {
      id: makeId('qzsub'), quizId: quiz.id, name: name.trim().slice(0, 20),
      score: Number(score) || 0, correctCount: Number(correctCount) || 0,
      totalBlanks: Number(totalBlanks) || 0, firstTryCount: Number(firstTryCount) || 0,
      submittedAt: new Date().toISOString()
    };
    submissions.unshift(submission);
    await writeData('quizSubmissions', submissions);
    res.json(submission);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/quiz/:id/leaderboard', async (req, res) => {
  try {
    const submissions = (await readData('quizSubmissions')) || [];
    const list = submissions
      .filter((s) => s.quizId === req.params.id)
      .sort((a, b) => b.score - a.score || b.firstTryCount - a.firstTryCount)
      .map((s) => ({ name: s.name, score: s.score }));
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 기도요청·문의 새 글 도배 방지 (같은 IP에서 10분에 5건까지)
router.post('/prayers', limitRequests({ name: 'prayer-post', max: 5, windowMs: TEN_MIN, message: '짧은 시간에 너무 많은 글이 등록되었습니다. 잠시 후 다시 시도해주세요.' }));
router.post('/inquiries', limitRequests({ name: 'inquiry-post', max: 5, windowMs: TEN_MIN, message: '짧은 시간에 너무 많은 글이 등록되었습니다. 잠시 후 다시 시도해주세요.' }));
router.use('/prayers', createSecretBoardRouter('prayers', { requiredMessage: '기도 내용을 입력해주세요.' }));
router.use('/inquiries', createSecretBoardRouter('inquiries', { requiredMessage: '문의 내용을 입력해주세요.' }));

router.get('/praises', async (req, res) => {
  try {
    const praises = (await readData('praises')) || [];
    res.json([...praises].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/praise-categories', async (req, res) => {
  try {
    res.json((await readData('praiseCategories')) || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/sermon-categories', async (req, res) => {
  try {
    res.json((await readData('sermonCategories')) || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/sermon-category-tags', async (req, res) => {
  try {
    res.json((await readData('sermonCategoryTags')) || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
