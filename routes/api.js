const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
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

// ---------- 비밀글 지원 게시판 (기도 요청 / 온라인 문의 공용) ----------
// 같은 구조(이름·내용·비밀글 여부·비밀번호)를 쓰는 두 기능을 하나의 팩토리로 관리합니다.
// key: 'prayers' → 기도 요청, 'inquiries' → 온라인 문의
function createSecretBoardRouter(key, { requiredMessage }) {
  const board = express.Router();

  // 목록 (공개) - 비밀글은 내용을 감추고 표시만 함
  board.get('/', async (req, res) => {
    try {
      const items = (await readData(key)) || [];
      const sorted = [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.json(
        sorted.map((p) => ({
          id: p.id,
          name: p.name || '익명',
          date: p.date,
          secret: !!p.secret,
          content: p.secret ? '' : p.content
        }))
      );
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 등록 (공개, 로그인 불필요)
  board.post('/', async (req, res) => {
    try {
      const { name, content, secret, password } = req.body;
      if (!content || !content.trim()) {
        return res.status(400).json({ error: requiredMessage });
      }
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
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 비밀글 비밀번호 확인 (공개) - 맞으면 내용을 돌려줌
  board.post('/:id/verify', async (req, res) => {
    try {
      const { password } = req.body;
      const items = (await readData(key)) || [];
      const item = items.find((p) => p.id === req.params.id);
      if (!item) return res.status(404).json({ error: '요청을 찾을 수 없습니다.' });

      if (!item.secret) {
        return res.json({ ok: true, content: item.content, name: item.name, date: item.date });
      }
      const valid = item.passwordHash && bcrypt.compareSync(String(password || ''), item.passwordHash);
      if (!valid) return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });

      res.json({ ok: true, content: item.content, name: item.name, date: item.date });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return board;
}

router.use('/prayers', createSecretBoardRouter('prayers', { requiredMessage: '기도 내용을 입력해주세요.' }));
router.use('/inquiries', createSecretBoardRouter('inquiries', { requiredMessage: '문의 내용을 입력해주세요.' }));

module.exports = router;
