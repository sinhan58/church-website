const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { readData, writeData, makeId, saveUploadedFile } = require('../utils/db');
const { requireAuth, requireMainAdmin, requirePermission } = require('../middleware/auth');
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
// ---------- 관리자 계정 마이그레이션 (최초 1회, 기존 .env 계정 → 메인 관리자로 이전) ----------
async function ensureMainAdmin() {
  const admins = (await readData('admins')) || [];
  if (admins.length > 0) return admins;

  const username = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!username || !passwordHash) return admins;

  const mainAdmin = {
    id: makeId('admin'),
    username,
    passwordHash,
    role: 'main',
    permissions: { site: true, menu: true, posts: true, sermons: true, qt: true, missions: true, stats: true, receipts: true, accounts: true },
    createdAt: new Date().toISOString()
  };
  const updated = [mainAdmin];
  await writeData('admins', updated);
  return updated;
}

// ---------- 로그인 / 로그아웃 ----------
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admins = await ensureMainAdmin();
    const admin = admins.find((a) => a.username === username);
    const validPass = admin ? bcrypt.compareSync(password || '', admin.passwordHash) : false;

    if (!admin || !validPass) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    req.session.isAdmin = true;
    req.session.adminId = admin.id;
    req.session.adminUsername = admin.username;
    req.session.adminRole = admin.role;
    req.session.adminPermissions = admin.permissions;
    res.json({ ok: true, role: admin.role, permissions: admin.permissions, username: admin.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/session', (req, res) => {
  if (!req.session || !req.session.isAdmin) return res.json({ isAdmin: false });
  res.json({
    isAdmin: true,
    username: req.session.adminUsername,
    role: req.session.adminRole,
    permissions: req.session.adminPermissions
  });
});

// 아래 모든 라우트는 로그인 필요
router.use(requireAuth);

// ---------- 내 비밀번호 변경 (모든 관리자 공통) ----------
router.put('/my-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: '새 비밀번호는 6자 이상이어야 합니다.' });
    }
    const admins = (await readData('admins')) || [];
    const idx = admins.findIndex((a) => a.id === req.session.adminId);
    if (idx === -1) return res.status(404).json({ error: '계정을 찾을 수 없습니다.' });

    const ok = bcrypt.compareSync(currentPassword || '', admins[idx].passwordHash);
    if (!ok) return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다.' });

    admins[idx].passwordHash = bcrypt.hashSync(newPassword, 10);
    await writeData('admins', admins);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 관리자 계정 관리 (메인 관리자 전용) ----------
router.get('/accounts', requireMainAdmin, async (req, res) => {
  try {
    const admins = (await readData('admins')) || [];
    // 비밀번호 해시는 노출하지 않음
    res.json(admins.map(({ passwordHash, ...rest }) => rest));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/accounts', requireMainAdmin, async (req, res) => {
  try {
    const { username, password, permissions } = req.body;
    if (!username || !password || password.length < 6) {
      return res.status(400).json({ error: '아이디와 6자 이상의 비밀번호를 입력해주세요.' });
    }
    const admins = (await readData('admins')) || [];
    if (admins.some((a) => a.username === username)) {
      return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
    }
    const newAdmin = {
      id: makeId('admin'),
      username,
      passwordHash: bcrypt.hashSync(password, 10),
      role: 'sub',
      permissions: {
        site: !!permissions?.site,
        menu: !!permissions?.menu,
        posts: !!permissions?.posts,
        sermons: !!permissions?.sermons,
        qt: !!permissions?.qt,
        missions: !!permissions?.missions,
        stats: !!permissions?.stats,
        receipts: !!permissions?.receipts,
        accounts: false // 부관리자는 계정관리 권한을 가질 수 없음
      },
      createdAt: new Date().toISOString()
    };
    admins.push(newAdmin);
    await writeData('admins', admins);
    const { passwordHash, ...safe } = newAdmin;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/accounts/:id', requireMainAdmin, async (req, res) => {
  try {
    const admins = (await readData('admins')) || [];
    const idx = admins.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '계정을 찾을 수 없습니다.' });
    if (admins[idx].role === 'main') {
      return res.status(403).json({ error: '메인 관리자 권한은 여기서 수정할 수 없습니다.' });
    }

    if (req.body.permissions) {
      admins[idx].permissions = {
        ...admins[idx].permissions,
        site: !!req.body.permissions.site,
        menu: !!req.body.permissions.menu,
        posts: !!req.body.permissions.posts,
        sermons: !!req.body.permissions.sermons,
        qt: !!req.body.permissions.qt,
        missions: !!req.body.permissions.missions,
        stats: !!req.body.permissions.stats,
        receipts: !!req.body.permissions.receipts
      };
    }
    if (req.body.newPassword) {
      if (req.body.newPassword.length < 6) {
        return res.status(400).json({ error: '비밀번호는 6자 이상이어야 합니다.' });
      }
      admins[idx].passwordHash = bcrypt.hashSync(req.body.newPassword, 10);
    }
    await writeData('admins', admins);
    const { passwordHash, ...safe } = admins[idx];
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/accounts/:id', requireMainAdmin, async (req, res) => {
  try {
    const admins = (await readData('admins')) || [];
    const target = admins.find((a) => a.id === req.params.id);
    if (!target) return res.status(404).json({ error: '계정을 찾을 수 없습니다.' });
    if (target.role === 'main') return res.status(403).json({ error: '메인 관리자는 삭제할 수 없습니다.' });

    const filtered = admins.filter((a) => a.id !== req.params.id);
    await writeData('admins', filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

router.put('/site', requirePermission('site'), async (req, res) => {
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

router.post('/menu', requirePermission('menu'), async (req, res) => {
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

router.put('/menu/:id', requirePermission('menu'), async (req, res) => {
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

router.delete('/menu/:id', requirePermission('menu'), async (req, res) => {
  try {
    const menu = (await readData('menu')) || [];
    const filtered = menu.filter((m) => m.id !== req.params.id);
    await writeData('menu', filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/menu-reorder', requirePermission('menu'), async (req, res) => {
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

router.post('/posts', requirePermission('posts'), async (req, res) => {
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

router.put('/posts/:id', requirePermission('posts'), async (req, res) => {
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

router.delete('/posts/:id', requirePermission('posts'), async (req, res) => {
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
router.post('/sermons/refresh', requirePermission('sermons'), async (req, res) => {
  try {
    const channelId = req.body.channelId || process.env.YOUTUBE_CHANNEL_ID;
    const data = await updateSermonsCache(channelId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 오늘의 큐티 관리 ----------
router.get('/qt', async (req, res) => {
  try {
    const qt = (await readData('qt')) || [];
    res.json([...qt].sort((a, b) => new Date(b.date) - new Date(a.date)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/qt', requirePermission('qt'), async (req, res) => {
  try {
    const qt = (await readData('qt')) || [];
    const item = {
      id: makeId('qt'),
      date: req.body.date || new Date().toISOString().slice(0, 10),
      title: req.body.title || '',
      verseRef: req.body.verseRef || '',
      verseText: req.body.verseText || '',
      body: req.body.body || '',
      pastor: req.body.pastor || '',
      amen: 0,
      createdAt: new Date().toISOString()
    };
    qt.unshift(item);
    await writeData('qt', qt);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/qt/:id', requirePermission('qt'), async (req, res) => {
  try {
    const qt = (await readData('qt')) || [];
    const idx = qt.findIndex((q) => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '큐티를 찾을 수 없습니다.' });
    const { amen, id, createdAt, ...editable } = req.body; // 반응 수·id·생성일은 여기서 직접 수정 불가
    qt[idx] = { ...qt[idx], ...editable };
    await writeData('qt', qt);
    res.json(qt[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/qt/:id', requirePermission('qt'), async (req, res) => {
  try {
    const qt = (await readData('qt')) || [];
    const filtered = qt.filter((q) => q.id !== req.params.id);
    await writeData('qt', filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 큐티 섹션 배경 디자인 (site 데이터의 qtBackground 필드에 저장)
router.put('/qt-background', requirePermission('qt'), async (req, res) => {
  try {
    const site = (await readData('site')) || {};
    site.qtBackground = {
      type: req.body.type === 'photo' ? 'photo' : 'preset',
      preset: req.body.preset || 'navy',
      image: req.body.image || ''
    };
    await writeData('site', site);
    res.json(site.qtBackground);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 선교사역 (세계지도 핀) ----------
router.get('/missions', async (req, res) => {
  try {
    res.json((await readData('missions')) || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/missions', requirePermission('missions'), async (req, res) => {
  try {
    const missions = (await readData('missions')) || [];
    const item = {
      id: makeId('mission'),
      order: missions.length,
      countryCode: req.body.countryCode || '',
      country: req.body.country || '',
      lat: Number(req.body.lat) || 0,
      lon: Number(req.body.lon) || 0,
      name: req.body.name || '',
      tag: req.body.tag || '',
      desc: req.body.desc || '',
      image: req.body.image || '',
      createdAt: new Date().toISOString()
    };
    missions.push(item);
    await writeData('missions', missions);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/missions/:id', requirePermission('missions'), async (req, res) => {
  try {
    const missions = (await readData('missions')) || [];
    const idx = missions.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '선교지 정보를 찾을 수 없습니다.' });
    const { id, createdAt, ...editable } = req.body;
    missions[idx] = { ...missions[idx], ...editable };
    await writeData('missions', missions);
    res.json(missions[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/missions/:id', requirePermission('missions'), async (req, res) => {
  try {
    const missions = (await readData('missions')) || [];
    const filtered = missions.filter((m) => m.id !== req.params.id);
    await writeData('missions', filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 동역자의 섬김 ----------
router.get('/partners', async (req, res) => {
  try {
    res.json((await readData('partners')) || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/partners', requirePermission('missions'), async (req, res) => {
  try {
    const partners = (await readData('partners')) || [];
    const item = {
      id: makeId('partner'),
      order: partners.length,
      name: req.body.name || '',
      image: req.body.image || '',
      startDate: req.body.startDate || '',
      note: req.body.note || '',
      createdAt: new Date().toISOString()
    };
    partners.push(item);
    await writeData('partners', partners);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/partners/:id', requirePermission('missions'), async (req, res) => {
  try {
    const partners = (await readData('partners')) || [];
    const idx = partners.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '동역자 정보를 찾을 수 없습니다.' });
    const { id, createdAt, ...editable } = req.body;
    partners[idx] = { ...partners[idx], ...editable };
    await writeData('partners', partners);
    res.json(partners[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/partners/:id', requirePermission('missions'), async (req, res) => {
  try {
    const partners = (await readData('partners')) || [];
    const filtered = partners.filter((p) => p.id !== req.params.id);
    await writeData('partners', filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 통계 ----------
router.get('/stats', requirePermission('stats'), async (req, res) => {
  try {
    res.json((await readData('stats')) || { pageviews: {}, clicks: {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 기부금 영수증 신청 관리 ----------
router.get('/receipt-requests', requirePermission('receipts'), async (req, res) => {
  try {
    res.json((await readData('receiptRequests')) || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/receipt-requests/:id', requirePermission('receipts'), async (req, res) => {
  try {
    const requests = (await readData('receiptRequests')) || [];
    const filtered = requests.filter((r) => r.id !== req.params.id);
    await writeData('receiptRequests', filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
