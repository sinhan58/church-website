// 설교 영상 카드용 포스터 이미지를 자동으로 생성하는 모듈입니다.
// - 목사님 사진(배경 제거된 PNG) + 그라데이션/보케 배경 + 설교 제목을 합성합니다.
// - 유튜브 영상마다(videoId 기준) 색상/사진/배치가 자동으로 순환되어, 매번 디자인을
//   따로 하지 않아도 다양한 느낌의 카드가 나옵니다.
//
// 한글 폰트 로딩 방식에 대한 중요한 참고사항:
// 처음에는 SVG의 @font-face로 폰트를 base64로 직접 심는 방식을 썼는데, 배포 서버(Render)의
// librsvg 버전에서는 이 방식이 제대로 동작하지 않아 글자가 16진수 코드 박스로 깨져 나오는
// 문제가 있었습니다. 그래서 지금은 폰트를 시스템 폰트처럼 등록(fontconfig)해서, SVG에서는
// 그냥 font-family 이름으로만 참조하는 훨씬 더 폭넓게 호환되는 방식으로 바꿨습니다.

const path = require('path');
const fs = require('fs');
const os = require('os');

const FONT_DIR = path.join(__dirname, 'fonts');
const FONT_FAMILY = 'Noto Sans CJK KR Black'; // 폰트 파일 안에 실제로 저장된 이름

// sharp(내부적으로 librsvg 사용)가 SVG 안의 한글 글자를 그릴 때 이 폰트를 찾을 수 있도록,
// 임시 폴더에 fontconfig 설정 파일을 만들어서 등록합니다. (서버에 관리자 권한으로 폰트를
// 설치할 필요 없이, 이 앱 실행 중에만 적용되는 방식이라 안전합니다.)
try {
  const fontconfigDir = path.join(os.tmpdir(), 'church-sermon-poster-fontconfig');
  const cacheDir = path.join(os.tmpdir(), 'church-sermon-poster-fontconfig-cache');
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
  process.env.FONTCONFIG_FILE = fontconfigFile;
} catch (err) {
  console.error('[sermonPoster] 폰트 설정 실패 - 시스템 기본 폰트로 대체될 수 있습니다:', err.message);
}

const sharp = require('sharp');

const PHOTOS_DIR = path.join(__dirname, 'assets', 'sermon-card-photos');

// 기본으로 내장된 목사님 사진(배경 제거 완료본). 관리자 페이지에서 추가로 올린 사진이 있으면
// 그것들과 합쳐서 함께 순환됩니다.
const BUILTIN_PHOTOS = ['pastor-1.png', 'pastor-2.png', 'pastor-3.png']
  .map((f) => path.join(PHOTOS_DIR, f))
  .filter((p) => fs.existsSync(p));

const W = 1200;
const H = 675;
const GOLD = '#c9a227';
const WHITE = '#ffffff';

const ACCENT_PALETTE = [
  ['#0d1526', '#0f2a2d'], // 네이비 -> 딥틸
  ['#3a1220', '#2a2015'], // 와인 -> 웜차콜
  ['#14261a', '#0d1526'], // 포레스트 -> 네이비
  ['#241a35', '#3a1220'], // 퍼플 -> 와인
  ['#2a2015', '#14261a'] // 차콜 -> 포레스트
];

function hashStr(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// "주일예배 20260726 사도행전 19장 1~7절 말씀하신 대로 임하시는 성령"
// -> { verseRef: "사도행전 19장 1~7절", title: "말씀하신 대로 임하시는 성령" }
function parseSermonTitle(raw = '') {
  let t = raw.replace(/주일예배/g, '');
  t = t.replace(/\b\d{8}\b/g, '').trim().replace(/^[-_·\s]+|[-_·\s]+$/g, '');
  const m = t.match(/^([가-힣]+\s?\d+장\s?(?:\d+(?:[~\-,]\s?\d+)*\s?절)+)\s*(.*)$/);
  if (m) return { verseRef: m[1].trim(), title: m[2].trim() || t };
  return { verseRef: '', title: t };
}

// 폰트 실측 없이(서버에 캔버스 라이브러리 없음) 글자수 기반으로 근사 줄바꿈합니다.
// Noto Sans KR Black은 한글 음절 폭이 거의 균일해서 이 방식으로도 자연스럽게 맞습니다.
function wrapByWidth(text, fontSize, maxWidth, avgCharRatio = 0.86) {
  const maxChars = Math.max(2, Math.floor(maxWidth / (fontSize * avgCharRatio)));
  const words = text.split(' ');
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

function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildBackgroundSvg({ accentFrom, accentTo, seed }) {
  const rnd = mulberry32(seed);
  let circles = '';
  for (let i = 0; i < 5; i++) {
    const r = 60 + rnd() * 120;
    const cx = rnd() * W;
    const cy = rnd() * H;
    const op = 0.05 + rnd() * 0.06;
    circles += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${GOLD}" opacity="${op.toFixed(3)}" filter="url(#blur)"/>`;
  }
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${accentFrom}"/>
        <stop offset="100%" stop-color="${accentTo}"/>
      </linearGradient>
      <filter id="blur"><feGaussianBlur stdDeviation="22"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${circles}
  </svg>`;
}

function buildTextOverlaySvg({ title, verseRef, pastorName, churchName, photoOnRight, textMaxWidth, hasPhoto }) {
  let titleFontSize = 92;
  let lineHeight = 106;
  let titleLines = wrapByWidth(title, titleFontSize, textMaxWidth, 0.86);
  while (titleLines.length > 3 && titleFontSize > 56) {
    titleFontSize -= 8;
    lineHeight -= 9;
    titleLines = wrapByWidth(title, titleFontSize, textMaxWidth, 0.86);
  }
  titleLines = titleLines.slice(0, 4);

  const startX = !hasPhoto ? (W - textMaxWidth) / 2 : photoOnRight ? 60 : W - textMaxWidth - 60;
  const textAnchor = 'start';

  let y = 172;
  let titleTspans = '';
  for (const line of titleLines) {
    titleTspans += `<text x="${startX}" y="${y}" font-size="${titleFontSize}" font-family="Noto Sans CJK KR Black" font-weight="900" fill="${WHITE}" text-anchor="${textAnchor}">${escapeXml(line)}</text>`;
    y += lineHeight;
  }

  y += 18;
  let verseSvg = '';
  if (verseRef) {
    verseSvg = `<text x="${startX}" y="${y}" font-size="30" font-family="Noto Sans CJK KR Black" fill="${GOLD}" text-anchor="${textAnchor}">${escapeXml(verseRef)}</text>`;
    y += 48;
  }

  y += 14;
  const lineY = y;
  y += 26;

  const nameSvg = `<text x="${startX}" y="${y}" font-size="26" font-family="Noto Sans CJK KR Black" fill="${WHITE}" text-anchor="${textAnchor}">${escapeXml(pastorName)}</text>`;
  y += 38;
  const churchSvg = `<text x="${startX}" y="${y}" font-size="19" font-family="Noto Sans CJK KR Black" fill="#c8c8c3" text-anchor="${textAnchor}">${escapeXml(churchName)}</text>`;

  const sideBar = hasPhoto
    ? photoOnRight
      ? `<rect x="0" y="0" width="10" height="${H}" fill="${GOLD}"/>`
      : `<rect x="${W - 10}" y="0" width="10" height="${H}" fill="${GOLD}"/>`
    : '';

  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="${GOLD}" stroke-width="2"/>
    ${sideBar}
    <text x="${startX}" y="70" font-size="20" font-family="Noto Sans CJK KR Black" fill="${GOLD}" text-anchor="${textAnchor}" letter-spacing="2">SERMONS</text>
    <rect x="${startX}" y="84" width="52" height="4" fill="${GOLD}"/>
    ${titleTspans}
    ${verseSvg}
    <line x1="${startX}" y1="${lineY}" x2="${startX + 320}" y2="${lineY}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1"/>
    ${nameSvg}
    ${churchSvg}
  </svg>`;
}

/**
 * 설교 카드 포스터 이미지(PNG 버퍼)를 생성합니다.
 * @param {Object} opts
 * @param {string} opts.videoId - 유튜브 영상 ID (색상/사진/배치를 정하는 기준)
 * @param {string} opts.rawTitle - 유튜브 원본 제목
 * @param {string[]} [opts.extraPhotoUrls] - 관리자 페이지에서 추가로 올린 사진 URL 목록(선택)
 * @param {string} [opts.pastorName]
 * @param {string} [opts.churchName]
 */
async function generateSermonPoster({
  videoId,
  rawTitle,
  extraPhotoUrls = [],
  pastorName = '',
  churchName = ''
}) {
  const { verseRef, title } = parseSermonTitle(rawTitle);
  const h = hashStr(videoId);
  const [accentFrom, accentTo] = ACCENT_PALETTE[h % ACCENT_PALETTE.length];
  const photoOnRight = (h >> 3) % 2 === 0;
  const textMaxWidth = 580;

  // 사진 후보: 기본 내장 사진 + 관리자가 추가로 올린 사진
  const photoBuffers = [];
  const localPool = BUILTIN_PHOTOS;
  let photoBuffer = null;
  const allCount = localPool.length + extraPhotoUrls.length;

  if (allCount > 0) {
    const pick = h % allCount;
    if (pick < localPool.length) {
      photoBuffer = fs.readFileSync(localPool[pick]);
    } else {
      const url = extraPhotoUrls[pick - localPool.length];
      const fetchFn = global.fetch || require('node-fetch');
      const res = await fetchFn(url);
      photoBuffer = Buffer.from(await res.arrayBuffer());
    }
  }

  const bgSvg = buildBackgroundSvg({ accentFrom, accentTo, seed: h });
  const textSvg = buildTextOverlaySvg({
    title,
    verseRef,
    pastorName,
    churchName,
    photoOnRight,
    textMaxWidth,
    hasPhoto: !!photoBuffer
  });

  const layers = [];

  if (photoBuffer) {
    const photoMeta = await sharp(photoBuffer).metadata();
    const targetH = Math.round(H * 0.98);
    let targetW = Math.round((photoMeta.width * targetH) / photoMeta.height);

    const maxPhotoWidth = W - textMaxWidth - 60 - 40 - 30;
    let photoResized = sharp(photoBuffer).resize({ height: targetH });
    if (targetW > maxPhotoWidth) {
      const cropLeft = Math.round((targetW - maxPhotoWidth) / 2);
      photoResized = photoResized.extract({ left: cropLeft, top: 0, width: maxPhotoWidth, height: targetH });
      targetW = maxPhotoWidth;
    }
    const photoBuf = await photoResized.toBuffer();
    const photoLeft = photoOnRight ? W - targetW - 30 : 30;
    const photoTop = H - targetH;
    layers.push({ input: photoBuf, top: photoTop, left: photoLeft });
  }

  layers.push({ input: Buffer.from(textSvg), top: 0, left: 0 });

  return sharp(Buffer.from(bgSvg)).composite(layers).png().toBuffer();
}

module.exports = { generateSermonPoster, parseSermonTitle };
