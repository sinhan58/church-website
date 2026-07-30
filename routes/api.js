const express = require('express');
const router = express.Router();
const { readData } = require('../utils/db');
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

module.exports = router;
