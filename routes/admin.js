const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { readData, writeData, makeId, saveUploadedFile } = require('../utils/db');
const { requireAuth } = require('../middleware/auth');
const { updateSermonsCache, getCachedSermons } = require('../utils/youtube');

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');

// ---------- 파일 업로드 설정 ----------
// 파일을 메모리에 잠깐 담아두었다가(diskStorage 대신 memoryStorage), 아래에서
// Supabase 연결 여부에 따라 Storage에 올리거나 로컬 디스크에 저장합니다.
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB 제한
  fileFilter: (req, file, cb) => {
    const ok = /image\/(jpeg|png|gif|webp)/.test(file.mimetype);
    cb(ok ? null : new Error('이미지 파일만 업로드할 수 있습니다.'), ok);
  }
});

// 첨부파일(이미지 외 문서 등) 업로드 - 확장자 제한 없이 허용
const attachmentUpload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB 제한
});

// 업로드된 파일 하나를 저장하고(Supabase Storage 또는 로컬 디스크) 접근 가능한 URL을 돌려줍니다.
async function storeFile(file) {
  const ext = path.extname(file.originalname);
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
  return saveUploadedFile(file.buffer, filename, file.mimetype, uploadsDir);
}

// 한글 파일명이 깨지는 문제 보정 (multer가 원본 파일명을 latin1로 읽어들이는 이슈)
function fixKoreanFilename(name = '') {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}

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
router.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '업로드된 파일이 없습니다.' });
  try {
    const url = await storeFile(req.file);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 게시글 첨부파일 업로드 (여러 개, 문서/이미지 등 모든 형식 허용)
router.post('/upload-attachment', attachmentUpload.array('files', 5), async (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: '업로드된 파일이 없습니다.' });
  try {
    const files = await Promise.all(
      req.files.map(async (f) => ({
        name: fixKoreanFilename(f.originalname),
        url: await storeFile(f)
      }))
    );
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
      attachments: Array.isArray(req.body.attachments) ? req.body.attachments : [],
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
