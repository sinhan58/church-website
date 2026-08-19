require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const cron = require('node-cron');

const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const { updateSermonsCache } = require('./utils/youtube');
const { readData } = require('./utils/db');
const { renderQtDetailPage } = require('./utils/qt-page');
const { renderIndexPage } = require('./utils/render-index');
const { createStaticPageRenderer } = require('./utils/render-static-page');
const renderPrayerPage = createStaticPageRenderer('prayer.html');
const renderInquiryPage = createStaticPageRenderer('inquiry.html');
const renderReceiptPage = createStaticPageRenderer('receipt.html');
const renderQuizPage = createStaticPageRenderer('quiz.html');
const renderPrivacyPage = createStaticPageRenderer('privacy.html');

const app = express();
const PORT = process.env.PORT || 3000;

// 업로드 폴더가 없으면 생성 (첫 배포 시 빈 폴더는 git에 올라가지 않으므로 안전장치)
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8 // 8시간
    }
  })
);

// 사이트 주소 (환경변수로 지정, 없으면 배포 주소로 기본값)
const SITE_URL = process.env.SITE_URL || 'https://muldaen.com';

// 사이트맵 (홈 + 큐티 상세 페이지들을 매 요청마다 최신 목록으로 반영)
app.get('/sitemap.xml', async (req, res) => {
  try {
    const qt = (await readData('qt')) || [];
    const urls = [
      `<url><loc>${SITE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...qt.map(
        (q) =>
          `<url><loc>${SITE_URL}/qt/${q.id}</loc><changefreq>never</changefreq><priority>0.6</priority></url>`
      )
    ];
    res.type('application/xml');
    res.send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`
    );
  } catch (err) {
    res.status(500).send('사이트맵 생성 실패');
  }
});

// 큐티 상세 페이지 (검색엔진이 매일의 큐티를 각각 독립된 페이지로 색인할 수 있도록 서버에서 직접 렌더링)
app.get('/qt/:id', async (req, res, next) => {
  try {
    const [site, qtList] = await Promise.all([readData('site'), readData('qt')]);
    const list = (qtList || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    const item = list.find((q) => q.id === req.params.id);
    if (!item) return next(); // 없으면 기존 SPA 폴백(홈)으로
    const idx = list.findIndex((q) => q.id === req.params.id);
    const prev = list[idx + 1] || null; // 더 과거
    const nextItem = idx > 0 ? list[idx - 1] : null; // 더 최근
    res.send(renderQtDetailPage({ site: site || {}, item, prev, next: nextItem, siteUrl: SITE_URL }));
  } catch (err) {
    next(err);
  }
});

// 홈페이지 (관리자가 고른 글씨체를 서버에서 미리 반영해서 보내, 방문자가
// "기본 글씨체 → 설정한 글씨체"로 바뀌는 깜빡임을 보지 않도록 직접 렌더링)
app.get('/', async (req, res, next) => {
  try {
    const [site, menu] = await Promise.all([readData('site'), readData('menu')]);
    res.send(renderIndexPage({ site: site || {}, menu: menu || [] }));
  } catch (err) {
    next(err);
  }
});

// 기도 요청 / 온라인 문의 / 영수증 신청 (역시 관리자가 고른 글씨체를 미리 반영해서 보냄)
app.get('/prayer.html', async (req, res, next) => {
  try {
    const site = await readData('site');
    res.send(renderPrayerPage({ site: site || {} }));
  } catch (err) {
    next(err);
  }
});
app.get('/inquiry.html', async (req, res, next) => {
  try {
    const site = await readData('site');
    res.send(renderInquiryPage({ site: site || {} }));
  } catch (err) {
    next(err);
  }
});
app.get('/receipt.html', async (req, res, next) => {
  try {
    const site = await readData('site');
    res.send(renderReceiptPage({ site: site || {} }));
  } catch (err) {
    next(err);
  }
});
app.get('/quiz.html', async (req, res, next) => {
  try {
    const site = await readData('site');
    res.send(renderQuizPage({ site: site || {} }));
  } catch (err) {
    next(err);
  }
});
app.get('/privacy.html', async (req, res, next) => {
  try {
    const site = await readData('site');
    res.send(renderPrivacyPage({ site: site || {} }));
  } catch (err) {
    next(err);
  }
});

// 정적 파일 (홈페이지 외 나머지 화면 + 관리자 화면 + 업로드 이미지)
// index:false로 꺼둔 이유: 그대로 두면 '/' 요청을 이 static 미들웨어가 먼저 가로채서
// public/index.html을 그냥 파일 그대로 보내버려, 위에서 만든 '/' 라우트가 아예 실행되지
// 않습니다. 그래서 '/' 하나는 위 라우트가 전담하고, 그 외 정적 파일들은 그대로 이걸로 서빙합니다.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// API 라우트
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// 관리자 화면 진입점 (SPA 형태로 로그인/대시보드를 admin.js에서 분기)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// 그 외 경로는 메인 홈페이지로 (마찬가지로 글씨체를 미리 반영해서 보냅니다)
app.get('*', async (req, res, next) => {
  try {
    const [site, menu] = await Promise.all([readData('site'), readData('menu')]);
    res.send(renderIndexPage({ site: site || {}, menu: menu || [] }));
  } catch (err) {
    next(err);
  }
});

app.listen(PORT, () => {
  console.log(`✅ 교회 홈페이지 서버 실행 중: http://localhost:${PORT}`);
  console.log(`   관리자 페이지: http://localhost:${PORT}/admin`);
});

// ---------- 유튜브 설교 영상 자동 업데이트 스케줄러 ----------
// 월~토: 새벽 4시 / 일요일: 오후 1시
const cronExprWeekday = process.env.YOUTUBE_UPDATE_CRON_WEEKDAY || '0 4 * * 1-6';
const cronExprSunday = process.env.YOUTUBE_UPDATE_CRON_SUNDAY || '0 13 * * 0';
if (process.env.YOUTUBE_CHANNEL_ID) {
  const runUpdate = async () => {
    try {
      console.log('⏳ 유튜브 설교 영상 자동 업데이트 실행...');
      await updateSermonsCache(process.env.YOUTUBE_CHANNEL_ID);
      console.log('✅ 유튜브 설교 영상 업데이트 완료');
    } catch (err) {
      console.error('❌ 유튜브 업데이트 실패:', err.message);
    }
  };

  cron.schedule(cronExprWeekday, runUpdate);
  cron.schedule(cronExprSunday, runUpdate);

  // 서버 시작 시에도 한 번 즉시 갱신 시도 (실패해도 서버는 계속 실행)
  updateSermonsCache(process.env.YOUTUBE_CHANNEL_ID).catch((err) =>
    console.warn('⚠️ 서버 시작 시 유튜브 갱신 실패 (채널ID를 확인하세요):', err.message)
  );
} else {
  console.warn('⚠️ YOUTUBE_CHANNEL_ID가 설정되지 않아 자동 업데이트가 비활성화되었습니다.');
}
