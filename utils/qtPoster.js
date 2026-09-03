// 큐티 카드 "공유용 포스터" 이미지를 만드는 모듈입니다.
// - 홈페이지 카드에서 CSS로 얹던 제목「」/부제목/말씀구절 글씨를, 사진 위에 실제로
//   합성해서 하나의 완성된 이미지 파일로 만들어줍니다. 이러면 카카오톡 등으로 공유했을 때
//   사진과 글씨가 분리되지 않고 그대로 한 장의 사진처럼 전달됩니다.
// - 설교 포스터(sermonPoster.js)와 똑같은 방식(SVG로 글씨를 그리고 sharp로 사진 위에
//   합성)을 씁니다.

const path = require('path');
const fs = require('fs');
const os = require('os');

const FONT_DIR = path.join(__dirname, 'fonts');
const FONT_FAMILY = 'Noto Sans CJK KR Black';

// 폰트 설정은 sermonPoster.js가 이미 해뒀을 수도 있지만, 이 모듈만 단독으로 불려도
// 정상 동작하도록 여기서도 한 번 더 안전하게 설정해둡니다 (중복 설정해도 문제 없음).
try {
  const fontconfigDir = path.join(os.tmpdir(), 'church-qt-poster-fontconfig');
  const cacheDir = path.join(os.tmpdir(), 'church-qt-poster-fontconfig-cache');
  if (!fs.existsSync(fontconfigDir)) fs.mkdirSync(fontconfigDir, { recursive: true });
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const fontconfigFile = path.join(fontconfigDir, 'fonts.conf');
  const xml = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONT_DIR}</dir>
  <cachedir>${cacheDir}</cachedir>
</fontconfig>`;
  fs.writeFileSync(fontconfigFile, xml);
  if (!process.env.FONTCONFIG_FILE) process.env.FONTCONFIG_FILE = fontconfigFile;
} catch (err) {
  console.error('[qtPoster] 폰트 설정 실패 - 시스템 기본 폰트로 대체될 수 있습니다:', err.message);
}

const sharp = require('sharp');

// 정사각형에 가까운 비율(홈페이지 카드 사진 영역과 동일한 380:395 느낌)로,
// SNS 공유에도 무난한 1080 사이즈로 만듭니다.
const W = 1080;
const H = 1120;
const GOLD = '#e4c876';
const WHITE = '#ffffff';

function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// 폰트 실측 없이 글자수 기반으로 근사 줄바꿈 (한글 음절 폭이 거의 균일한 걸 이용)
function wrapByWidth(text, fontSize, maxWidth, avgCharRatio = 0.98) {
  const maxChars = Math.max(2, Math.floor(maxWidth / (fontSize * avgCharRatio)));
  const words = String(text || '').split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = (cur + ' ' + w).trim();
    if (test.length <= maxChars) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// 홈페이지 카드와 같은 위계(제목 크게 + 골드 꺾쇠, 부제목, 말씀구절)로 텍스트 SVG를 만듭니다.
function buildQtTextSvg({ title, subtitle, verseRef }) {
  const centerX = W / 2;
  const maxTextWidth = W - 160;

  const titleFontSize = 62;
  const titleLineHeight = 78;
  let titleLines = wrapByWidth(title, titleFontSize, maxTextWidth - 90, 0.98); // 양쪽 꺾쇠 자리만큼 살짝 좁게
  titleLines = titleLines.slice(0, 3);

  const subtitleFontSize = 34;
  const subtitleLineHeight = 46;
  const subtitleLines = subtitle ? wrapByWidth(subtitle, subtitleFontSize, maxTextWidth, 1.0).slice(0, 2) : [];

  const verseFontSize = 32;

  // 전체 텍스트 블록 높이를 계산해서, 캔버스 세로 중앙에 오도록 시작 y를 정합니다.
  const titleBlockH = titleLines.length * titleLineHeight;
  const subtitleBlockH = subtitleLines.length ? subtitleLines.length * subtitleLineHeight + 28 : 0;
  const verseBlockH = verseRef ? verseFontSize + 40 : 0;
  const totalH = titleBlockH + subtitleBlockH + verseBlockH;

  const topExtraSpace = -70; // 제목이 위쪽에서 잘리지 않도록, 완전 중앙보다 살짝 위로 밀어줍니다
  let y = H / 2 - totalH / 2 + titleFontSize * 0.75 + topExtraSpace;

  let titleTspans = '';
  titleLines.forEach((line, i) => {
    const isFirst = i === 0;
    const isLast = i === titleLines.length - 1;
    const prefix = isFirst ? `<tspan fill="${GOLD}" font-weight="400">「</tspan>` : '';
    const suffix = isLast ? `<tspan fill="${GOLD}" font-weight="400">」</tspan>` : '';
    titleTspans += `<text x="${centerX}" y="${y}" font-size="${titleFontSize}" font-family="${FONT_FAMILY}" font-weight="900" fill="${WHITE}" text-anchor="middle">${prefix}${escapeXml(line)}${suffix}</text>`;
    y += titleLineHeight;
  });

  let subtitleTspans = '';
  if (subtitleLines.length) {
    y += 28;
    subtitleLines.forEach((line) => {
      subtitleTspans += `<text x="${centerX}" y="${y}" font-size="${subtitleFontSize}" font-family="${FONT_FAMILY}" font-weight="500" fill="${WHITE}" fill-opacity="0.92" text-anchor="middle">${escapeXml(line)}</text>`;
      y += subtitleLineHeight;
    });
  }

  let verseSvg = '';
  if (verseRef) {
    y += 30;
    verseSvg = `<text x="${centerX}" y="${y}" font-size="${verseFontSize}" font-family="${FONT_FAMILY}" font-weight="700" fill="${GOLD}" text-anchor="middle" letter-spacing="1">${escapeXml(verseRef)}</text>`;
  }

  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="qtTextShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#000000" flood-opacity="0.55"/>
      </filter>
    </defs>
    <g filter="url(#qtTextShadow)">
      ${titleTspans}
      ${subtitleTspans}
      ${verseSvg}
    </g>
  </svg>`;
}

// 사진 위에 깔리는 은은한 어둡게 처리(그라디언트) — 홈페이지 카드의 오버레이와 동일한 느낌
function buildOverlaySvg() {
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="qtOverlay" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0d1526" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="#0d1526" stop-opacity="0.58"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#qtOverlay)"/>
  </svg>`;
}

/**
 * 큐티 카드 공유용 포스터 이미지(JPEG 버퍼)를 만듭니다.
 * @param {Object} opts
 * @param {string} opts.imageUrl - 배경으로 쓸 사진 주소 (보관함에서 배정된 bgImage)
 * @param {string} opts.title - 큐티 제목
 * @param {string} opts.subtitle - 부제목 (선택)
 * @param {string} opts.verseRef - 말씀 구절 위치 (선택)
 */
async function generateQtPoster({ imageUrl, title, subtitle, verseRef, format = 'jpeg' }) {
  const textSvg = buildQtTextSvg({ title, subtitle, verseRef });
  const overlaySvg = buildOverlaySvg();

  let base;
  if (imageUrl) {
    let photoBuffer;
    if (/^https?:\/\//i.test(imageUrl)) {
      const fetchFn = global.fetch || require('node-fetch');
      const res = await fetchFn(imageUrl);
      photoBuffer = Buffer.from(await res.arrayBuffer());
    } else {
      // 로컬 업로드 경로(/uploads/...)인 경우, 실제 디스크 파일 경로로 바꿔서 읽습니다.
      const localPath = path.join(__dirname, '..', 'public', imageUrl.replace(/^\//, ''));
      photoBuffer = fs.readFileSync(localPath);
    }
    base = sharp(photoBuffer).resize({ width: W, height: H, fit: 'cover', position: 'centre' });
  } else {
    // 사진이 없으면 사이트 톤에 맞는 짙은 네이비 배경으로 대체합니다.
    base = sharp({
      create: { width: W, height: H, channels: 3, background: { r: 13, g: 21, b: 38 } }
    });
  }

  const buffer = await base
    .composite([
      { input: Buffer.from(overlaySvg), left: 0, top: 0 },
      { input: Buffer.from(textSvg), left: 0, top: 0 }
    ])
    [format === 'png' ? 'png' : 'jpeg'](format === 'png' ? undefined : { quality: 88 })
    .toBuffer();

  return buffer;
}

const { readData, writeData, saveUploadedFile } = require('./db');

// 큐티를 등록할 때 자동으로 포스터를 만들어서 저장해두고, 그 주소를 돌려줍니다.
async function buildAndCacheQtPoster({ qtId, imageUrl, title, subtitle, verseRef, uploadsDir }) {
  const buffer = await generateQtPoster({ imageUrl, title, subtitle, verseRef, format: 'jpeg' });
  const filename = `qt-poster-${qtId}-${Date.now()}.jpg`;
  const url = await saveUploadedFile(buffer, filename, 'image/jpeg', uploadsDir);
  return url;
}

module.exports = {
  generateQtPoster,
  buildAndCacheQtPoster
};
