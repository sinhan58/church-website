const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const { readData, writeData, makeId } = require('../utils/db');
const { getCachedSermons } = require('../utils/youtube');
const { buildAndCacheSermonPoster, pregenerateMissingSermonPosters } = require('../utils/sermonPoster');

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');

router.get('/sermon-poster/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
      return res.status(400).json({ error: '잘못된 영상 ID입니다.' });
    }
    const rawTitle = String(req.query.title || '').slice(0, 200);
    const idxRaw = Number(req.query.idx);
    const videoIndex = Number.isInteger(idxRaw) && idxRaw >= 0 ? idxRaw : null;

    const posters = (await readData('sermonPosters')) || {};
    const cached = posters[videoId];
    if (cached && cached.title === rawTitle && cached.url) {
      return res.redirect(cached.url);
    }

    const { buffer } = await buildAndCacheSermonPoster({ videoId, rawTitle, videoIndex, uploadsDir });
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
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

router.post('/qt/:id/amen', async (req, res) => {
  try {
    const qt = (await readData('qt')) || [];
    const idx = qt.findIndex((q) => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '큐티를 찾을 수 없습니다.' });
    const delta = req.body.action === 'remove' ? -1 : 1;
    qt[idx].amen = Math.max(0, (qt[idx].amen || 0) + delta);
    await writeData('qt', qt);
    res.json({ amen: qt[idx].amen });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/track', async (req, res) => {
  try {
    const { type, path: trackPath, label } = req.body;
    const today = new Date().toISOString().slice(0, 10);
    const stats = (await readData('stats')) || { pageviews: {}, clicks: {} };
    if (type === 'pageview' && trackPath) {
      stats.pageviews[today] = stats.pageviews[today] || {};
      stats.pageviews[today][trackPath] = (stats.pageviews[today][trackPath] || 0) + 1;
    } else if (type === 'click' && label) {
      stats.clicks[today] = stats.clicks[today] || {};
      stats.clicks[today][label] = (stats.clicks[today][label] || 0) + 1;
    } else {
      return res.status(400).json({ error: '잘못된 요청입니다.' });
    }
    await writeData('stats', stats);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false }); }
});

router.post('/receipt-requests', async (req, res) => {
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
      const valid = item.passwordHash && bcrypt.compareSync(String(password || ''), item.passwordHash);
      if (!valid) return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
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

router.post('/quiz/:id/submit', async (req, res) => {
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

router.use('/prayers', createSecretBoardRouter('prayers', { requiredMessage: '기도 내용을 입력해주세요.' }));
router.use('/inquiries', createSecretBoardRouter('inquiries', { requiredMessage: '문의 내용을 입력해주세요.' }));

router.get('/praises', async (req, res) => {
  try {
    const praises = (await readData('praises')) || [];
    res.json([...praises].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
