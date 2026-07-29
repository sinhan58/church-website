const express = require('express');
const router = express.Router();
const { readData } = require('../utils/db');
const { getCachedSermons } = require('../utils/youtube');

// 사이트 기본 정보 (교회소개, 예배시간, 연락처 등)
router.get('/site', (req, res) => {
  res.json(readData('site'));
});

// 메뉴 목록 (순서대로 정렬)
router.get('/menu', (req, res) => {
  const menu = readData('menu') || [];
  const sorted = [...menu].sort((a, b) => a.order - b.order);
  res.json(sorted);
});

// 게시판 (소식·활동) - 상단고정 우선, 최신순
router.get('/posts', (req, res) => {
  const posts = readData('posts') || [];
  const sorted = [...posts].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.date) - new Date(a.date);
  });
  res.json(sorted);
});

// 설교 영상 (유튜브 자동 캐시)
router.get('/sermons', (req, res) => {
  res.json(getCachedSermons());
});

module.exports = router;
