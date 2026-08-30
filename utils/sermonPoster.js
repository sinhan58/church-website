// 설교 섹션 왼쪽 "이번 주일 설교" 히어로 카드용 포스터 이미지를 만드는 모듈입니다.
// - 배경이 제거된(투명 PNG) 목사님 사진을, 디자인된 배경 패널 위에 얹는 방식입니다.
// - 사진 배경과 패널을 억지로 이어붙이지 않아도 되므로, 예전에 있었던 "경계선"
//   문제 자체가 구조적으로 생기지 않습니다.
// - utils/assets/sermon-card-photos 폴더에는 이제 배경이 제거된 투명 PNG만 넣어주세요.
//
// 한글 폰트 로딩 방식에 대한 참고사항: SVG @font-face(base64) 방식은 Render 서버의 librsvg에서
// 깨져서, 폰트를 fontconfig로 시스템 폰트처럼 등록하고 SVG에서는 font-family 이름만 참조합니다.

const path = require('path');
const fs = require('fs');
const os = require('os');

const FONT_DIR = path.join(__dirname, 'fonts');
const FONT_FAMILY = 'Noto Sans CJK KR Black';

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

// 이 폴더 안에 있는 사진 파일을 이름 상관없이 전부 자동으로 찾아서 씁니다.
// (예전엔 pastor-1.png/2.png/3.png처럼 정해진 이름만 인식했는데, 이제는 폴더에
// 사진을 넣기만 하면 파일명에 관계없이 자동으로 순환 목록에 추가됩니다)
const BUILTIN_PHOTOS = (() => {
  try {
    return fs
      .readdirSync(PHOTOS_DIR)
      .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
      .sort()
      .map((f) => path.join(PHOTOS_DIR, f));
  } catch (err) {
    return [];
  }
})();

const W = 1200;
const H = 970; // 사진이 커진 만큼(1.4375배) 세로로 잘리지 않도록 캔버스 자체를 늘림 (기존 675)
const PHOTO_W = 660; // 오른쪽 사진 영역 폭 (전체의 55%로 확대, 왼쪽 제목 영역이 45%)
const GOLD = '#c9a227';
const WHITE = '#ffffff';
const NAVY = '#0d1526';
const PURPLE = '#241a35';

function hashStr(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

// "주일예배 20260726 사도행전 19장 1~7절 말씀하신 대로 임하시는 성령"
// -> { verseRef: "사도행전 19장 1~7절", title: "말씀하신 대로 임하시는 성령" }
function parseSermonTitle(raw = '') {
  let t = raw.replace(/주일예배/g, '');
  t = t.replace(/\b\d{8}\b/g, '').trim().replace(/^[-_·\s]+|[-_·\s]+$/g, '');
  t = t.replace(/\s{2,}/g, ' '); // 단어를 지우면서 남는 이중 띄어쓰기 정리
  const m = t.match(/^([가-힣]+\s?\d+장\s?\d+(?:[~\-]\d+)?절(?:,\s?\d+(?:[~\-]\d+)?절)*)\s*(.*)$/);
  if (m) return { verseRef: m[1].trim(), title: m[2].trim() || t };
  return { verseRef: '', title: t };
}

// 폰트 실측 없이 글자수 기반으로 근사 줄바꿈 (Noto Sans KR Black은 음절 폭이 거의 균일)
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

// 왼쪽 텍스트 영역: "주일 설교" 라벨 + 제목 + 구절 + 교회명 + 목사님 성함.
function buildTextSvg({ title, verseRef, pastorName, churchName }) {
  const textX = 56;
  const textMaxWidth = W - PHOTO_W - 56 - 40 + 200; // 오른쪽 줄바꿈 경계를 더 오른쪽으로 확장 (사진 확대로 줄어든 폭 보정 + 사진과 안 겹치게 적당히)

  let titleFontSize = 56;
  let lineHeight = 68;
  const titleLines = wrapByWidth(title, titleFontSize, textMaxWidth, 0.86); // 줄 수 제한 없음, 말줄임표 없음

  const NOMINAL_LINES = 3; // 검증된 레이아웃의 기준 줄 수 — 구절/교회명/성함 자리는 이 기준으로 항상 고정
  const baseY = H / 2 - ((NOMINAL_LINES - 1) * lineHeight) / 2 - 90; // 글씨 커진 만큼 하단 띠와 안 겹치도록 더 위로 이동 (기존과 동일한 고정값)
  const TITLE_SHIFT_UP = 38; // 약 1cm — 제목만 이만큼 추가로 위로
  const TITLE_LINE_GAP_EXTRA = 11; // 약 3mm — 제목 줄간격만 이만큼 더 넓게
  const titleLineHeight = lineHeight + TITLE_LINE_GAP_EXTRA;
  // 제목이 기준(3줄)보다 길어지면, 초과된 줄 수만큼 제목 시작점을 추가로 위로 올려서
  // 구절/교회명/성함 자리를 침범하지 않게 합니다. 3줄 이하일 때는 기존과 완전히 동일합니다.
  const extraLines = Math.max(0, titleLines.length - NOMINAL_LINES);
  let titleY = baseY - TITLE_SHIFT_UP - extraLines * titleLineHeight;
  let titleTspans = '';
  for (const line of titleLines) {
    titleTspans += `<text x="${textX}" y="${titleY}" font-size="${titleFontSize}" font-family="${FONT_FAMILY}" font-weight="900" fill="${WHITE}">${escapeXml(line)}</text>`;
    titleY += titleLineHeight;
  }

  // 구절/교회명/성함은 제목이 몇 줄이든(짧든 길든) 상관없이, 항상 기준(3줄) 자리에서
  // 그대로 이어서 계산합니다 — 기존 레이아웃과 완전히 동일하게 유지됩니다.
  let y = baseY + NOMINAL_LINES * lineHeight;
  y += 26;
  let verseSvg = '';
  if (verseRef) {
    verseSvg = `<text x="${textX}" y="${y}" font-size="26" font-family="${FONT_FAMILY}" fill="${GOLD}">${escapeXml(verseRef)}</text>`;
    y += 44;
  }

  y += 16;
  const lineY = y;
  y += 40;
  const churchSvg = `<text x="${textX}" y="${y}" font-size="36" font-family="${FONT_FAMILY}" font-weight="700" fill="${WHITE}">${escapeXml(churchName)}</text>`;
  y += 44;
  const pastorSvg = pastorName
    ? `<text x="${textX}" y="${y}" font-size="29" font-family="${FONT_FAMILY}" fill="#c8c8c3">${escapeXml(pastorName)}</text>`
    : '';

  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${titleTspans}
    ${verseSvg}
    <line x1="${textX}" y1="${lineY}" x2="${textX + 280}" y2="${lineY}" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1"/>
    ${churchSvg}
    ${pastorSvg}
  </svg>`;
}

// 글자가 항상 잘 읽히도록 하고, 은은한 색감(청록·와인색)을 더한 배경 패널을 만듭니다.
// 사람은 이 위에 별도로(오려낸 PNG로) 얹으므로, 여기서는 사진과 관련된 처리를 전혀
// 하지 않습니다 — 그래서 예전의 "경계선" 문제 자체가 생길 수 없습니다.
function buildPanelSvg() {
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <!-- 테스트: 배경 패널(남색 + 빛 번짐)을 걷어내고 완전히 투명하게 둡니다.
         원래대로 되돌리려면 이 주석 아래 주석 처리된 원본 내용을 다시 사용하세요. -->
    <!--
    <defs>
      <radialGradient id="tealGlow" cx="15%" cy="10%" r="65%">
        <stop offset="0%" stop-color="#0f8f9a" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="#0f8f9a" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="wineGlow" cx="90%" cy="95%" r="55%">
        <stop offset="0%" stop-color="#7a1f3d" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="#7a1f3d" stop-opacity="0"/>
      </radialGradient>
      <filter id="colorBlur"><feGaussianBlur stdDeviation="60"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="${NAVY}"/>
    <g filter="url(#colorBlur)">
      <rect width="${W}" height="${H}" fill="url(#tealGlow)"/>
      <rect width="${W}" height="${H}" fill="url(#wineGlow)"/>
    </g>
    -->
  </svg>`;
}

/**
 * "이번 주일 설교" 히어로 카드 포스터 이미지(PNG/JPEG 버퍼)를 생성합니다.
 * 배경 없이 오려낸 인물 사진(투명 PNG)을 디자인된 배경 패널 위에 얹는 방식입니다.
 */
// 합성 없이, 이번에 쓸 사진이 "로컬 파일"인지 "관리자가 올린 URL"인지와 그 경로/주소만
// 알려줍니다. 이제 사진은 그대로(가공 없이) 보여주고, 제목·구절은 별도 칸에 표시하므로
// 이 함수 하나로 충분합니다.
function pickSermonPhotoSource({ videoId, extraPhotoUrls = [], photoOverride = '' }) {
  const localPool = BUILTIN_PHOTOS;

  if (photoOverride) {
    const overridePath = localPool.find((p) => path.basename(p) === photoOverride);
    if (overridePath) return { type: 'file', value: overridePath };
  }

  const allCount = localPool.length + extraPhotoUrls.length;
  if (allCount === 0) return null;

  const h = hashStr(videoId);
  const pick = h % allCount;
  if (pick < localPool.length) return { type: 'file', value: localPool[pick] };
  return { type: 'url', value: extraPhotoUrls[pick - localPool.length] };
}

async function generateSermonPoster({
  videoId,
  rawTitle,
  extraPhotoUrls = [],
  pastorName = '',
  churchName = '',
  videoIndex = null,
  photoOverride = '', // 관리자가 직접 고른 사진 파일명 (예: 'pastor-cutout.png'). 있으면 이걸 최우선으로 씁니다.
  format = 'jpeg'
}) {
  const { verseRef, title } = parseSermonTitle(rawTitle);
  const h = hashStr(videoId);

  const localPool = BUILTIN_PHOTOS;
  let photoBuffer = null;

  if (photoOverride) {
    const overridePath = localPool.find((p) => path.basename(p) === photoOverride);
    if (overridePath) {
      photoBuffer = fs.readFileSync(overridePath);
    }
  }

  if (!photoBuffer) {
    const allCount = localPool.length + extraPhotoUrls.length;
    if (allCount > 0) {
      const pick = videoIndex !== null && videoIndex !== undefined ? videoIndex % allCount : h % allCount;
      if (pick < localPool.length) {
        photoBuffer = fs.readFileSync(localPool[pick]);
      } else {
        const url = extraPhotoUrls[pick - localPool.length];
        const fetchFn = global.fetch || require('node-fetch');
        const res = await fetchFn(url);
        photoBuffer = Buffer.from(await res.arrayBuffer());
      }
    }
  }

  const textSvg = buildTextSvg({ title, verseRef, pastorName, churchName });
  const panelSvg = buildPanelSvg();

  const zoneLeft = W - PHOTO_W;

  if (photoBuffer) {
    // 오려낸 인물 사진은 자르지 않고, 세로 기준으로만 맞춰서 전체가 다 보이게 합니다
    // (사람 실루엣은 사각형이 아니라서, cover로 자르면 머리나 팔이 잘릴 수 있습니다).
    const targetH = Math.round(675 * 1.4375); // 사진 15% 추가 확대 (기존 1.25 → 1.4375) — 캔버스가 커져도 사진 크기는 원래 기준(675)에 고정
    const cutoutBuf = await sharp(photoBuffer)
      .resize({ height: targetH, fit: 'inside', withoutEnlargement: false })
      .ensureAlpha()
      .png()
      .toBuffer();
    const meta = await sharp(cutoutBuf).metadata();
    const cutoutW = meta.width || Math.round(PHOTO_W);
    let cutoutH = meta.height || targetH;

    // 확대하면서 캔버스보다 커질 수 있는데, 머리가 잘리면 안 되니 위쪽은 그대로 두고
    // 아래쪽(강대상 부분)만 잘라내서 캔버스 안에 맞춥니다.
    let finalCutoutBuf = cutoutBuf;
    if (cutoutH > H) {
      finalCutoutBuf = await sharp(cutoutBuf)
        .extract({ left: 0, top: 0, width: cutoutW, height: H })
        .toBuffer();
      cutoutH = H;
    }

    // 사진 영역(오른쪽) 안에서 왼쪽 시작점은 고정해두고, 사진이 커지는 만큼
    // 오른쪽으로 채워지도록(오른쪽 캔버스 끝까지) 자리를 잡습니다.
    const SHIFT_LEFT = 60; // 왼쪽 기준점(왼쪽으로 살짝만 당김, 크기와 무관하게 고정)
    let left = zoneLeft - SHIFT_LEFT;
    left = Math.max(zoneLeft - 170, Math.min(left, W - cutoutW + 10)); // 캔버스 밖으로 심하게 나가지 않도록 보정
    const top = Math.max(0, H - cutoutH);

    return sharp(Buffer.from(panelSvg))
      .composite([
        { input: finalCutoutBuf, left, top },
        { input: Buffer.from(textSvg), left: 0, top: 0 }
      ])
      [format === 'png' ? 'png' : 'jpeg'](format === 'png' ? undefined : { quality: 88 })
      .toBuffer();
  }

  // 사진이 아예 없을 때를 대비한 기본 배경
  const fallback = sharp(Buffer.from(panelSvg)).composite([
    { input: Buffer.from(textSvg), left: 0, top: 0 }
  ]);
  return format === 'png' ? fallback.png().toBuffer() : fallback.jpeg({ quality: 88 }).toBuffer();
}

const { readData, writeData, saveUploadedFile } = require('./db');

async function buildAndCacheSermonPoster({ videoId, rawTitle, videoIndex, uploadsDir }) {
  const site = (await readData('site')) || {};
  const pastorName = site.about?.pastorName || '';
  const churchName = site.churchName || '';
  const extraPhotoUrls = Array.isArray(site.sermonCardPhotos) ? site.sermonCardPhotos : [];
  const photoOverride = site.sermonPhotoOverride || '';

  const buffer = await generateSermonPoster({
    videoId,
    rawTitle,
    extraPhotoUrls,
    pastorName,
    churchName,
    videoIndex,
    photoOverride,
    format: 'png' // 테스트: 배경 투명 처리를 위해 PNG로 변경 (JPEG는 투명도를 지원하지 않음)
  });

  const filename = `sermon-poster-${videoId}-${Date.now()}.png`;
  const url = await saveUploadedFile(buffer, filename, 'image/png', uploadsDir);

  const posters = (await readData('sermonPosters')) || {};
  posters[videoId] = { url, title: rawTitle, createdAt: new Date().toISOString() };
  await writeData('sermonPosters', posters);

  return { buffer, url };
}

// 이제 카드가 "이번 주일 설교" 히어로 한 장만 필요하므로, 최신 영상 1개만 미리 만들어둡니다.
async function pregenerateMissingSermonPosters(videos, uploadsDir) {
  try {
    const posters = (await readData('sermonPosters')) || {};
    const targets = videos.slice(0, 1);
    for (const v of targets) {
      const cached = posters[v.videoId];
      if (cached && cached.title === v.title && cached.url) continue;
      await buildAndCacheSermonPoster({ videoId: v.videoId, rawTitle: v.title, uploadsDir });
    }
  } catch (err) {
    console.error('[sermonPoster] 설교 카드 미리 생성 중 오류(다음 요청 시 다시 시도됩니다):', err.message);
  }
}

function listBuiltinPhotoFilenames() {
  return BUILTIN_PHOTOS.map((p) => path.basename(p));
}

module.exports = {
  generateSermonPoster,
  parseSermonTitle,
  buildAndCacheSermonPoster,
  pregenerateMissingSermonPosters,
  listBuiltinPhotoFilenames,
  pickSermonPhotoSource
};
