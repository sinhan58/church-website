require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const cron = require('node-cron');

const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const { updateSermonsCache } = require('./utils/youtube');

const app = express();
const PORT = process.env.PORT || 3000;

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

// 정적 파일 (홈페이지 + 관리자 화면 + 업로드 이미지)
app.use(express.static(path.join(__dirname, 'public')));

// API 라우트
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// 관리자 화면 진입점 (SPA 형태로 로그인/대시보드를 admin.js에서 분기)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// 그 외 경로는 메인 홈페이지로
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ 교회 홈페이지 서버 실행 중: http://localhost:${PORT}`);
  console.log(`   관리자 페이지: http://localhost:${PORT}/admin`);
});

// ---------- 유튜브 설교 영상 자동 업데이트 스케줄러 ----------
const cronExpr = process.env.YOUTUBE_UPDATE_CRON || '0 4 * * *'; // 기본: 매일 새벽 4시
if (process.env.YOUTUBE_CHANNEL_ID) {
  cron.schedule(cronExpr, async () => {
    try {
      console.log('⏳ 유튜브 설교 영상 자동 업데이트 실행...');
      await updateSermonsCache(process.env.YOUTUBE_CHANNEL_ID);
      console.log('✅ 유튜브 설교 영상 업데이트 완료');
    } catch (err) {
      console.error('❌ 유튜브 업데이트 실패:', err.message);
    }
  });

  // 서버 시작 시에도 한 번 즉시 갱신 시도 (실패해도 서버는 계속 실행)
  updateSermonsCache(process.env.YOUTUBE_CHANNEL_ID).catch((err) =>
    console.warn('⚠️ 서버 시작 시 유튜브 갱신 실패 (채널ID를 확인하세요):', err.message)
  );
} else {
  console.warn('⚠️ YOUTUBE_CHANNEL_ID가 설정되지 않아 자동 업데이트가 비활성화되었습니다.');
}
