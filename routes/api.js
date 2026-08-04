const express = require('express');
const router = express.Router();
const { readData, writeData } = require('../utils/db');
const { getCachedSermons } = require('../utils/youtube');

// 사이트 기본 정보 (교회소개, 예배시간, 연락처 등)
router.get('/site', async (req, res) => {
  try {
    res.json(await readData('site'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 메뉴 목록 (순서대로 정렬)
router.get('/menu', async (req, res) => {
  try {
    const menu = (await readData('menu')) || [];
    const sorted = [...menu].sort((a, b) => a.order - b.order);
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 게시판 (소식·활동) - 상단고정 우선, 최신순
router.get('/posts', async (req, res) => {
  try {
    const posts = (await readData('posts')) || [];
    const sorted = [...posts].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.date) - new Date(a.date);
    });
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 게시판 상세보기 (단건 조회)
router.get('/posts/:id', async (req, res) => {
  try {
    const posts = (await readData('posts')) || [];
    const post = posts.find((p) => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 설교 영상 (유튜브 자동 캐시)
router.get('/sermons', async (req, res) => {
  try {
    res.json(await getCachedSermons());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 오늘의 큐티 ----------
// 목록 (최신순)
router.get('/qt', async (req, res) => {
  try {
    const qt = (await readData('qt')) || [];
    const sorted = [...qt].sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 단건 조회
router.get('/qt/:id', async (req, res) => {
  try {
    const qt = (await readData('qt')) || [];
    const item = qt.find((q) => q.id === req.params.id);
    if (!item) return res.status(404).json({ error: '큐티를 찾을 수 없습니다.' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 아멘 반응 추가/취소 (로그인 없이 이용, 중복 방지는 클라이언트(localStorage)에서 처리)
router.post('/qt/:id/amen', async (req, res) => {
  try {
    const qt = (await readData('qt')) || [];
    const idx = qt.findIndex((q) => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '큐티를 찾을 수 없습니다.' });
    const delta = req.body.action === 'remove' ? -1 : 1;
    qt[idx].amen = Math.max(0, (qt[idx].amen || 0) + delta);
    await writeData('qt', qt);
    res.json({ amen: qt[idx].amen });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 방문/클릭 통계 수집 (관리자 페이지 '통계'에서 확인) ----------
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
  } catch (err) {
    // 통계 수집 실패가 사용자 화면에 영향을 주면 안 되므로 에러여도 200으로 조용히 응답
    res.json({ ok: false });
  }
});

// ---------- 기부금 영수증 신청 ----------
router.post('/receipt-requests', async (req, res) => {
  try {
    const { name, phone, email, note } = req.body;
    if (!name || !phone) return res.status(400).json({ error: '이름과 연락처를 입력해주세요.' });

    const requests = (await readData('receiptRequests')) || [];
    requests.unshift({
      id: 'rc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      phone,
      email: email || '',
      note: note || '',
      createdAt: new Date().toISOString()
    });
    await writeData('receiptRequests', requests);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 선교사역 ----------
router.get('/missions', async (req, res) => {
  try {
    res.json((await readData('missions')) || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/partners', async (req, res) => {
  try {
    res.json((await readData('partners')) || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
