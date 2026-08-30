const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// sharp(이미지 압축용)는 배포 환경에 따라 설치가 안 돼있거나 실패할 수 있어서,
// 여기서 에러가 나도 로그인을 포함한 관리자 기능 전체가 죽지 않도록 안전하게 불러옵니다.
// 이 경우 이미지 압축만 건너뛰고(원본 그대로 저장) 나머지 기능은 정상 동작합니다.
let sharp = null;
try {
  sharp = require('sharp');
} catch (err) {
  console.error('[admin] sharp 모듈을 불러오지 못했습니다. 이미지 자동 압축 기능은 비활성화됩니다:', err.message);
}

const { readData, writeData, makeId, saveUploadedFile } = require('../utils/db');
const { requireAuth, requireMainAdmin, requirePermission } = require('../middleware/auth');
const { updateSermonsCache, getCachedSermons } = require('../utils/youtube');
const { pregenerateMissingSermonPosters, listBuiltinPhotoFilenames } = require('../utils/sermonPoster');
const { sendToAll } = require('../utils/push');

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');

// 푸시 알림에 들어갈 이미지 URL이 우리 서버에 업로드된 파일이거나(/uploads/...),
// 신뢰할 수 있는 https 링크인 경우만 허용합니다 (javascript: 등 악성 스킴 차단).
function isSafeMediaUrl(value) {
  if (!value || typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return false;
  return v.startsWith('/uploads/') || /^https:\/\//.test(v);
}

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

// 업로드된 이미지를 적당한 크기/용량으로 자동 압축합니다.
// - 가로 1600px보다 크면 1600px로 축소 (세로는 비율 유지, 더 작은 원본은 확대하지 않음)
//   ※ 사이트에서 사진이 실제로 화면에 보이는 가장 큰 크기(사진 확대 보기)가 1100px
//     안팎이라, 1600px면 고화질 화면에서도 충분히 선명하면서 용량은 확실히 줄어듭니다.
// - jpeg/webp는 화질 78 정도로 재압축해서 용량을 크게 줄임
// - PNG로 올라온 파일이라도, 실제로 투명한 부분(알파 채널)이 없는 '사진'이면 JPEG로
//   바꿔서 저장합니다. PNG는 무손실 압축이라 사진처럼 색이 복잡한 이미지에 쓰면 같은
//   화질이어도 용량이 몇 배씩 부풀어 오릅니다 (예: 8.7MB PNG 사진이 압축 후에도 PNG로
//   저장되면 1.8MB로 밖에 안 줄지만, JPEG로 바꾸면 0.2MB까지 줄어듭니다). 로고처럼
//   실제로 투명 배경이 있는 PNG는 그대로 PNG로 유지해서 투명도가 깨지지 않게 합니다.
// - 움짤(gif)은 원본 그대로 둠
const MAX_IMAGE_DIMENSION = 1600;

async function compressImageIfNeeded(file) {
  const isCompressibleImage = /^image\/(jpeg|png|webp)/.test(file.mimetype);
  if (!isCompressibleImage || !sharp) return file.buffer;

  try {
    const image = sharp(file.buffer, { failOn: 'none' });
    const metadata = await image.metadata();

    let pipeline = image.rotate(); // 사진의 EXIF 방향 정보를 반영해 실제로 보이는 방향대로 회전 보정
    if (metadata.width && metadata.width > MAX_IMAGE_DIMENSION) {
      pipeline = pipeline.resize({ width: MAX_IMAGE_DIMENSION, withoutEnlargement: true });
    }

    // 진짜로 투명한 부분이 있는 PNG만 PNG로 유지하고, 나머지(사진 등)는 전부
    // 용량이 훨씬 작은 JPEG로 저장합니다.
    const hasRealTransparency = metadata.format === 'png' && metadata.hasAlpha;

    if (metadata.format === 'webp') {
      pipeline = pipeline.webp({ quality: 78 });
    } else if (hasRealTransparency) {
      pipeline = pipeline.png({ quality: 78, compressionLevel: 9 });
    } else {
      pipeline = pipeline.jpeg({ quality: 78, mozjpeg: true });
    }

    return await pipeline.toBuffer();
  } catch (err) {
    // 압축 중 문제가 생겨도 업로드 자체가 실패하면 안 되므로, 이럴 땐 원본 그대로 저장합니다.
    console.error('이미지 압축 중 오류(원본으로 저장합니다):', err.message);
    return file.buffer;
  }
}

// 업로드된 파일 하나를 저장하고(Supabase Storage 또는 로컬 디스크) 접근 가능한 URL을 돌려줍니다.
async function storeFile(file) {
  const buffer = await compressImageIfNeeded(file);
  // JPEG로 형식이 바뀐 경우를 대비해, 압축 후 실제 내용을 보고 확장자를 다시 정합니다.
  const isCompressibleImage = /^image\/(jpeg|png|webp)/.test(file.mimetype);
  let ext = path.extname(file.originalname);
  if (isCompressibleImage && sharp && buffer !== file.buffer) {
    // compressImageIfNeeded가 PNG→JPEG로 바꿨을 수 있으니, 원래 확장자 대신
    // 실제로 압축된 파일 형식에 맞는 확장자를 사용합니다.
    try {
      const meta = await sharp(buffer).metadata();
      if (meta.format === 'jpeg') ext = '.jpg';
      else if (meta.format === 'png') ext = '.png';
      else if (meta.format === 'webp') ext = '.webp';
    } catch {
      // 확인 실패해도 원래 확장자로 진행 (치명적이지 않음)
    }
  }
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
  return saveUploadedFile(buffer, filename, file.mimetype, uploadsDir);
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
    // 카카오맵 관련 값은 화면에 그대로 꽂혀 들어가는 값이라, 정확히 카카오 지도 도메인의
    // https 주소인지 확인해서 혹시 모를 악성 스크립트 삽입을 막습니다.
    // 형식이 이상하면 그냥 빈 값으로 저장합니다.
    if (req.body.contact) {
      const c = req.body.contact;
      if (c.kakaoMapImageUrl && !/^https:\/\/staticmap\.kakao\.com\//.test(c.kakaoMapImageUrl)) {
        c.kakaoMapImageUrl = '';
      }
      if (c.kakaoMapLinkUrl && !/^https:\/\/map\.kakao\.com\//.test(c.kakaoMapLinkUrl)) {
        c.kakaoMapLinkUrl = '';
      }
    }
    const current = (await readData('site')) || {};
    const incoming = { ...req.body };

    // serviceTimes는 화면이 여러 개(기본 정보 저장 / 예배 시간별 세부 설정)에서 나눠서
    // 저장하다 보니, 배열을 통째로 덮어쓰면 한쪽 화면이 모르는 필드(굵게/글자크기/설명 등)가
    // 사라져버립니다. 그래서 항목을 id로 매칭해 필드 단위로 합쳐서 저장합니다.
    if (Array.isArray(incoming.serviceTimes)) {
      const currentList = Array.isArray(current.serviceTimes) ? current.serviceTimes : [];
      incoming.serviceTimes = incoming.serviceTimes.map((item) => {
        const existing = currentList.find((s) => s.id === item.id);
        return existing ? { ...existing, ...item } : item;
      });
    }

    const updated = { ...current, ...incoming };
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
    const data = await getCachedSermons();
    let archive = [];
    try {
      archive = (await readData('sermonsArchive')) || [];
    } catch (archiveErr) {
      archive = []; // 보관함을 못 읽어도 최신 목록은 정상적으로 내려줘야 함
    }
    const existingIds = new Set((data.videos || []).map((v) => v.videoId));
    const archiveOnly = archive.filter((v) => !existingIds.has(v.videoId));
    // 보관함 영상은 최신 목록 뒤에 붙여서, 관리자가 테마 태그를 해제할 수 있도록 목록에 나오게 합니다.
    res.json({ ...data, videos: [...(data.videos || []), ...archiveOnly] });
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
    // 관리자가 새로고침한 시점에 카드 이미지까지 미리 만들어두면, 방문자는 항상 이미
    // 완성된 이미지만 받아가게 됩니다. (응답은 먼저 보내고 뒤에서 이어서 처리)
    if (data && Array.isArray(data.videos)) {
      pregenerateMissingSermonPosters(data.videos, uploadsDir);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 설교 카드(목사님 사진+제목 자동합성 이미지) 캐시를 비웁니다.
// 디자인을 바꿨거나, 예전에 문제가 있던 채로 저장된 카드를 강제로 다시 만들고 싶을 때 사용합니다.
router.get('/sermon-photo-files', requirePermission('sermons'), async (req, res) => {
  try {
    res.json(listBuiltinPhotoFilenames());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/sermon-posters', requirePermission('sermons'), async (req, res) => {
  try {
    await writeData('sermonPosters', {});
    res.json({ ok: true });
    // 캐시를 비운 뒤 바로 다시 만들어둬서, 다음 방문자가 빈 상태를 보지 않게 합니다.
    const data = await getCachedSermons();
    if (data && Array.isArray(data.videos)) {
      pregenerateMissingSermonPosters(data.videos, uploadsDir);
    }
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
    await cancelScheduledPushesFor('qt', req.params.id);
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

// 유튜브 URL이나 영상ID를 그대로 받아서 11자리 영상ID만 뽑아냅니다.
function extractYoutubeId(input = '') {
  const s = String(input).trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s; // 이미 순수 영상ID인 경우
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return m[1];
  }
  return '';
}

// ---------- 찬양 관리 ----------
router.get('/praises', async (req, res) => {
  try {
    const praises = (await readData('praises')) || [];
    res.json([...praises].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/praises', async (req, res) => {
  try {
    const youtubeId = extractYoutubeId(req.body.youtubeUrl || req.body.youtubeId || '');
    if (!youtubeId) {
      return res.status(400).json({ error: '유튜브 주소(또는 영상ID)를 다시 확인해주세요.' });
    }
    const praises = (await readData('praises')) || [];
    const item = {
      id: makeId('praise'),
      title: req.body.title || '',
      singer: req.body.singer || '',
      youtubeId,
      categoryIds: Array.isArray(req.body.categoryIds) ? req.body.categoryIds : [],
      order: praises.length,
      createdAt: new Date().toISOString()
    };
    praises.push(item);
    await writeData('praises', praises);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/praises/:id', async (req, res) => {
  try {
    const praises = (await readData('praises')) || [];
    const idx = praises.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '찬양을 찾을 수 없습니다.' });

    const editable = { title: req.body.title, singer: req.body.singer };
    if (Array.isArray(req.body.categoryIds)) editable.categoryIds = req.body.categoryIds;
    if (req.body.youtubeUrl || req.body.youtubeId) {
      const youtubeId = extractYoutubeId(req.body.youtubeUrl || req.body.youtubeId);
      if (!youtubeId) return res.status(400).json({ error: '유튜브 주소(또는 영상ID)를 다시 확인해주세요.' });
      editable.youtubeId = youtubeId;
    }
    praises[idx] = { ...praises[idx], ...editable };
    await writeData('praises', praises);
    res.json(praises[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/praises/:id', async (req, res) => {
  try {
    const praises = (await readData('praises')) || [];
    const filtered = praises.filter((p) => p.id !== req.params.id);
    await writeData('praises', filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/praises-reorder', async (req, res) => {
  try {
    const praises = (await readData('praises')) || [];
    const order = req.body.order || [];
    const updated = praises.map((p) => {
      const pos = order.indexOf(p.id);
      return pos === -1 ? p : { ...p, order: pos };
    });
    await writeData('praises', updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 찬양 컨셉(카테고리) ----------
const DEFAULT_PRAISE_CATEGORIES = ['경배와 찬양', 'CCM', '잔잔한 묵상곡', '경쾌한 찬양', '어린이·다음세대', '절기 특별찬양'];

async function ensurePraiseCategoriesSeeded() {
  const categories = await readData('praiseCategories');
  if (categories && categories.length > 0) return categories;
  const seeded = DEFAULT_PRAISE_CATEGORIES.map((name) => ({ id: makeId('pcat'), name }));
  await writeData('praiseCategories', seeded);
  return seeded;
}

router.get('/praise-categories', async (req, res) => {
  try {
    res.json(await ensurePraiseCategoriesSeeded());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/praise-categories', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: '컨셉 이름을 입력해주세요.' });
    const categories = await ensurePraiseCategoriesSeeded();
    if (categories.some((c) => c.name === name)) {
      return res.status(409).json({ error: '이미 같은 이름의 컨셉이 있습니다.' });
    }
    const item = { id: makeId('pcat'), name };
    categories.push(item);
    await writeData('praiseCategories', categories);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/praise-categories/:id', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: '컨셉 이름을 입력해주세요.' });
    const categories = (await readData('praiseCategories')) || [];
    const idx = categories.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '컨셉을 찾을 수 없습니다.' });
    if (categories.some((c) => c.id !== req.params.id && c.name === name)) {
      return res.status(409).json({ error: '이미 같은 이름의 컨셉이 있습니다.' });
    }
    categories[idx] = { ...categories[idx], name };
    await writeData('praiseCategories', categories);
    res.json(categories[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/praise-categories/:id', async (req, res) => {
  try {
    const categories = (await readData('praiseCategories')) || [];
    const filtered = categories.filter((c) => c.id !== req.params.id);
    await writeData('praiseCategories', filtered);
    // 삭제된 컨셉은 곡들에 붙어있던 태그에서도 같이 지워줍니다.
    const praises = (await readData('praises')) || [];
    const updated = praises.map((p) => ({
      ...p,
      categoryIds: (p.categoryIds || []).filter((id) => id !== req.params.id)
    }));
    await writeData('praises', updated);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 설교 테마(카테고리) ----------
// 설교 영상은 유튜브에서 자동으로 동기화되므로, 어떤 영상이 어떤 테마인지는
// videoId를 기준으로 별도 저장해둡니다 (재동기화되어도 videoId는 바뀌지 않아 유지됩니다).
const DEFAULT_SERMON_CATEGORIES = ['주일설교', '수요예배', '특별집회', '성경강해 시리즈'];

async function ensureSermonCategoriesSeeded() {
  const categories = await readData('sermonCategories');
  if (categories && categories.length > 0) return categories;
  const seeded = DEFAULT_SERMON_CATEGORIES.map((name) => ({ id: makeId('scat'), name }));
  await writeData('sermonCategories', seeded);
  return seeded;
}

router.get('/sermon-categories', async (req, res) => {
  try {
    res.json(await ensureSermonCategoriesSeeded());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sermon-categories', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: '테마 이름을 입력해주세요.' });
    const categories = await ensureSermonCategoriesSeeded();
    if (categories.some((c) => c.name === name)) {
      return res.status(409).json({ error: '이미 같은 이름의 테마가 있습니다.' });
    }
    const item = { id: makeId('scat'), name };
    categories.push(item);
    await writeData('sermonCategories', categories);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/sermon-categories/:id', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: '테마 이름을 입력해주세요.' });
    const categories = (await readData('sermonCategories')) || [];
    const idx = categories.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '테마를 찾을 수 없습니다.' });
    if (categories.some((c) => c.id !== req.params.id && c.name === name)) {
      return res.status(409).json({ error: '이미 같은 이름의 테마가 있습니다.' });
    }
    categories[idx] = { ...categories[idx], name };
    await writeData('sermonCategories', categories);
    res.json(categories[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/sermon-categories/:id', async (req, res) => {
  try {
    const categories = (await readData('sermonCategories')) || [];
    const filtered = categories.filter((c) => c.id !== req.params.id);
    await writeData('sermonCategories', filtered);
    // 삭제된 테마는 영상에 붙어있던 태그에서도 같이 지워줍니다.
    const tags = (await readData('sermonCategoryTags')) || {};
    Object.keys(tags).forEach((videoId) => {
      tags[videoId] = (tags[videoId] || []).filter((id) => id !== req.params.id);
    });
    await writeData('sermonCategoryTags', tags);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 영상 하나에 테마를 여러 개 붙여서 저장 (videoId 기준)
router.put('/sermon-category-tags/:videoId', async (req, res) => {
  try {
    const categoryIds = Array.isArray(req.body.categoryIds) ? req.body.categoryIds : [];
    const tags = (await readData('sermonCategoryTags')) || {};
    tags[req.params.videoId] = categoryIds;
    await writeData('sermonCategoryTags', tags);
    res.json({ videoId: req.params.videoId, categoryIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sermon-category-tags', async (req, res) => {
  try {
    res.json((await readData('sermonCategoryTags')) || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


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

// ---------- 말씀 퀴즈 관리 ----------
// ---------- 푸시 알림 발송 ----------
router.post('/push/send', requirePermission('site'), async (req, res) => {
  try {
    const { title, body, url, image } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: '알림 제목을 입력해주세요.' });
    const safeImage = isSafeMediaUrl(image) ? image.trim() : '';
    const result = await sendToAll({ title: title.trim(), body: (body || '').trim(), url: url || '/', image: safeImage || undefined });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 자주 쓰는 알림 문구 저장 ----------
router.get('/push/templates', requirePermission('site'), async (req, res) => {
  try {
    res.json((await readData('pushTemplates')) || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/push/templates', requirePermission('site'), async (req, res) => {
  try {
    const { name, title, body, url, image } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '문구 이름을 입력해주세요.' });
    if (!title || !title.trim()) return res.status(400).json({ error: '알림 제목을 입력해주세요.' });
    const templates = (await readData('pushTemplates')) || [];
    const item = {
      id: makeId('pushtpl'),
      name: name.trim(),
      title: title.trim(),
      body: (body || '').trim(),
      url: (url || '').trim(),
      image: isSafeMediaUrl(image) ? image.trim() : ''
    };
    templates.push(item);
    await writeData('pushTemplates', templates);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/push/templates/:id', requirePermission('site'), async (req, res) => {
  try {
    const templates = (await readData('pushTemplates')) || [];
    const filtered = templates.filter((t) => t.id !== req.params.id);
    await writeData('pushTemplates', filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 예약 알림 ----------
// linkedType/linkedId: 큐티·말씀 퀴즈 등록 시 "이 글이 삭제되면 예약도 같이 취소"하기 위해 연결해둡니다.
router.get('/push/scheduled', requirePermission('site'), async (req, res) => {
  try {
    const scheduled = (await readData('scheduledPushes')) || [];
    const sorted = [...scheduled].sort((a, b) => new Date(b.sendAt) - new Date(a.sendAt));
    res.json(sorted.slice(0, 100)); // 화면이 끝없이 길어지지 않도록 최근 100건만 보여줌
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/push/scheduled', requirePermission('site'), async (req, res) => {
  try {
    const { title, body, url, image, sendAt, linkedType, linkedId } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: '알림 제목을 입력해주세요.' });
    if (!sendAt) return res.status(400).json({ error: '발송 시각을 선택해주세요.' });
    const scheduled = (await readData('scheduledPushes')) || [];
    const item = {
      id: makeId('pushsch'),
      title: title.trim(),
      body: (body || '').trim(),
      url: (url || '/').trim(),
      image: isSafeMediaUrl(image) ? image.trim() : '',
      sendAt,
      linkedType: linkedType || null,
      linkedId: linkedId || null,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    scheduled.push(item);
    await writeData('scheduledPushes', scheduled);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/push/scheduled/:id', requirePermission('site'), async (req, res) => {
  try {
    const scheduled = (await readData('scheduledPushes')) || [];
    const filtered = scheduled.filter((s) => s.id !== req.params.id);
    await writeData('scheduledPushes', filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 큐티·말씀 퀴즈 글이 삭제되면, 아직 안 보낸 연결된 예약 알림도 같이 취소합니다.
async function cancelScheduledPushesFor(linkedType, linkedId) {
  const scheduled = (await readData('scheduledPushes')) || [];
  const filtered = scheduled.filter(
    (s) => !(s.linkedType === linkedType && s.linkedId === linkedId && s.status === 'pending')
  );
  if (filtered.length !== scheduled.length) {
    await writeData('scheduledPushes', filtered);
  }
}

router.get('/quiz', async (req, res) => {
  try {
    const quizzes = (await readData('quizzes')) || [];
    res.json([...quizzes].reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// verses: [{ verseLabel: '3', rawText: '그러므로 여호와의 (말씀)에 내가...' }, ...]
// rawText 안의 (단어)가 빈칸이 됩니다. 관리자 페이지에서 붙여넣기 텍스트를 미리 이 구조로 잘라서 보냅니다.
router.post('/quiz', requirePermission('qt'), async (req, res) => {
  try {
    const { reference, weekLabel, verses } = req.body;
    if (!reference || !Array.isArray(verses) || verses.length === 0) {
      return res.status(400).json({ error: '본문 출처와 절 내용을 입력해주세요.' });
    }

    const parsedVerses = verses.map((v, i) => {
      const blanks = [];
      let blankIndex = 0;
      const rawText = v.rawText || '';
      const markedText = rawText.replace(/\(([^)]+)\)/g, (match, word) => {
        blankIndex += 1;
        const id = `b${blankIndex}`;
        blanks.push({ id, answer: word.trim() });
        return `{{${id}}}`;
      });
      const fullText = rawText.replace(/[()]/g, '');
      return {
        id: `v${i + 1}`,
        reference: v.reference || reference,
        verseLabel: v.verseLabel || '',
        markedText,
        fullText,
        blanks
      };
    });

    if (parsedVerses.every((v) => v.blanks.length === 0)) {
      return res.status(400).json({ error: '빈칸으로 만들 단어를 괄호로 표시해주세요. 예: (말씀)' });
    }

    const quizzes = (await readData('quizzes')) || [];
    const quiz = {
      id: makeId('quiz'),
      reference,
      weekLabel: weekLabel || new Date().toISOString().slice(0, 10),
      verses: parsedVerses,
      createdAt: new Date().toISOString()
    };
    quizzes.push(quiz);
    await writeData('quizzes', quizzes);
    res.json(quiz);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/quiz/:id', requirePermission('qt'), async (req, res) => {
  try {
    const { reference, weekLabel, verses } = req.body;
    if (!reference || !Array.isArray(verses) || verses.length === 0) {
      return res.status(400).json({ error: '본문 출처와 절 내용을 입력해주세요.' });
    }

    const parsedVerses = verses.map((v, i) => {
      const blanks = [];
      let blankIndex = 0;
      const rawText = v.rawText || '';
      const markedText = rawText.replace(/\(([^)]+)\)/g, (match, word) => {
        blankIndex += 1;
        const id = `b${blankIndex}`;
        blanks.push({ id, answer: word.trim() });
        return `{{${id}}}`;
      });
      const fullText = rawText.replace(/[()]/g, '');
      return {
        id: `v${i + 1}`,
        reference: v.reference || reference,
        verseLabel: v.verseLabel || '',
        markedText,
        fullText,
        blanks
      };
    });

    if (parsedVerses.every((v) => v.blanks.length === 0)) {
      return res.status(400).json({ error: '빈칸으로 만들 단어를 괄호로 표시해주세요. 예: (말씀)' });
    }

    const quizzes = (await readData('quizzes')) || [];
    const idx = quizzes.findIndex((q) => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '퀴즈를 찾을 수 없습니다.' });

    quizzes[idx] = {
      ...quizzes[idx],
      reference,
      weekLabel: weekLabel || quizzes[idx].weekLabel,
      verses: parsedVerses
    };
    await writeData('quizzes', quizzes);
    res.json(quizzes[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/quiz/:id/submissions', requirePermission('qt'), async (req, res) => {
  try {
    const submissions = (await readData('quizSubmissions')) || [];
    const list = submissions
      .filter((s) => s.quizId === req.params.id)
      .sort((a, b) => b.score - a.score || b.firstTryCount - a.firstTryCount);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/quiz/:id', requirePermission('qt'), async (req, res) => {
  try {
    const quizzes = (await readData('quizzes')) || [];
    const filtered = quizzes.filter((q) => q.id !== req.params.id);
    await writeData('quizzes', filtered);
    await cancelScheduledPushesFor('quiz', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/quiz/:id/leaderboard', async (req, res) => {
  try {
    const submissions = (await readData('quizSubmissions')) || [];
    const list = submissions
      .filter((s) => s.quizId === req.params.id)
      .sort((a, b) => b.score - a.score || b.firstTryCount - a.firstTryCount);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 기도 요청 / 온라인 문의 관리 (공용) ----------
// 로그인한 관리자는 비밀글 여부와 관계없이 전체 내용을 확인할 수 있습니다
// (다른 방문자에게는 비밀글 내용이 노출되지 않으며, 목회자가 확인하는 용도입니다).
function createSecretBoardAdminRouter(key) {
  const board = express.Router();

  board.get('/', async (req, res) => {
    try {
      const items = (await readData(key)) || [];
      const sorted = [...items]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(({ passwordHash, ...rest }) => rest);
      res.json(sorted);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  board.delete('/:id', async (req, res) => {
    try {
      const items = (await readData(key)) || [];
      const filtered = items.filter((p) => p.id !== req.params.id);
      await writeData(key, filtered);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 답글 저장 (목회자/관리자가 작성) - 작성자는 본인 비밀번호로 다시 열어보면 답글을 볼 수 있음
  board.put('/:id/reply', async (req, res) => {
    try {
      const items = (await readData(key)) || [];
      const idx = items.findIndex((p) => p.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: '글을 찾을 수 없습니다.' });
      items[idx].reply = (req.body.reply || '').trim();
      items[idx].repliedAt = items[idx].reply ? new Date().toISOString() : null;
      await writeData(key, items);
      const { passwordHash, ...safe } = items[idx];
      res.json(safe);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return board;
}

router.use('/prayers', createSecretBoardAdminRouter('prayers'));
router.use('/inquiries', createSecretBoardAdminRouter('inquiries'));

module.exports = router;
