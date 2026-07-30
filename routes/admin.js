const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { readData, writeData, makeId } = require('../utils/db');
const { requireAuth } = require('../middleware/auth');
const { updateSermonsCache, getCachedSermons } = require('../utils/youtube');

// ---------- 파일 업로드 설정 ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'public', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB 제한
  fileFilter: (req, file, cb) => {
    const ok = /image\/(jpeg|png|gif|webp)/.test(file.mimetype);
    cb(ok ? null : new Error('이미지 파일만 업로드할 수 있습니다.'), ok);
  }
});

// ---------- 로그인 / 로그아웃 ----------
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = username === process.env.ADMIN_USERNAME;
  const validPass = validUser && process.env.ADMIN_PASSWORD_HASH
    ? bcrypt.compareSync(password || '', process.env.ADMIN_PASSWORD_HASH)
    : false;

  if (!validUser || !validPass) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }

  req.session.isAdmin = true;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/session', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// 아래 모든 라우트는 로그인 필요
router.use(requireAuth);

// ---------- 이미지 업로드 ----------
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '업로드된 파일이 없습니다.' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ---------- 사이트 기본 정보 수정 ----------
router.get('/site', async (req, res) => {
  try {
    res.json(await readData('site'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/site', async (req, res) => {
  try {
    const current = (await readData('site')) || {};
    const updated = { ...current, ...req.body };
    await writeData('site', updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 메뉴 관리 ----------
router.get('/menu', async (req, res) => {
  try {
    res.json((await readData('menu')) || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/menu', async (req, res) => {
  try {
    const menu = (await readData('menu')) || [];
    const item = { id: makeId('m'), label: req.body.label, link: req.body.link, order: req.body.order ?? menu.length + 1 };
    menu.push(item);
    await writeData('menu', menu);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/menu/:id', async (req, res) => {
  try {
    const menu = (await readData('menu')) || [];
    const idx = menu.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '메뉴를 찾을 수 없습니다.' });
    menu[idx] = { ...menu[idx], ...req.body };
    await writeData('menu', menu);
    res.json(menu[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/menu/:id', async (req, res) => {
  try {
    const menu = (await readData('menu')) || [];
    const filtered = menu.filter((m) => m.id !== req.params.id);
    await writeData('menu', filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/menu-reorder', async (req, res) => {
  try {
    // req.body.order = [id1, id2, id3, ...] 순서
    const menu = (await readData('menu')) || [];
    const order = req.body.order || [];
    const updated = menu.map((m) => {
      const pos = order.indexOf(m.id);
      return pos === -1 ? m : { ...m, order: pos + 1 };
    });
    await writeData('menu', updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 게시판 (소식·활동) 관리 ----------
router.get('/posts', async (req, res) => {
  try {
    res.json((await readData('posts')) || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/posts', async (req, res) => {
  try {
    const posts = (await readData('posts')) || [];
    const post = {
      id: makeId('post'),
      category: req.body.category || '소식',
      title: req.body.title || '',
      content: req.body.content || '',
      image: req.body.image || '',
      date: req.body.date || new Date().toISOString().slice(0, 10),
      pinned: !!req.body.pinned
    };
    posts.unshift(post);
    await writeData('posts', posts);
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/posts/:id', async (req, res) => {
  try {
    const posts = (await readData('posts')) || [];
    const idx = posts.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    posts[idx] = { ...posts[idx], ...req.body };
    await writeData('posts', posts);
    res.json(posts[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/posts/:id', async (req, res) => {
  try {
    const posts = (await readData('posts')) || [];
    const filtered = posts.filter((p) => p.id !== req.params.id);
    await writeData('posts', filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 설교 영상(유튜브) 관리 ----------
router.get('/sermons', async (req, res) => {
  try {
    res.json(await getCachedSermons());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 관리자가 수동으로 즉시 새로고침 (자동 스케줄과 별개로 즉시 반영하고 싶을 때 사용)
router.post('/sermons/refresh', async (req, res) => {
  try {
    const channelId = req.body.channelId || process.env.YOUTUBE_CHANNEL_ID;
    const data = await updateSermonsCache(channelId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
