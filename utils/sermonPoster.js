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
const FONT_FAMILY_REGULAR = 'Noto Sans CJK KR'; // 새로 추가한 보통 굵기 폰트 (교회명·목사님 이름용)

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
const H = 900; // 4:3 비율 (지난 설교 목록의 자연스러운 높이와 맞도록 16:9에서 변경)
const PHOTO_W = 480; // 오른쪽 사진 영역 폭 (전체의 40%, 왼쪽 제목 영역이 60%)
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
  const textMaxWidth = W - PHOTO_W - 56 - 40;

  let titleFontSize = 56;
  let lineHeight = 68;
  let titleLines = wrapByWidth(title, titleFontSize, textMaxWidth, 0.86);
  const fullLines = wrapByWidth(title, titleFontSize, textMaxWidth, 0.86);
  titleLines = titleLines.slice(0, 4);
  if (fullLines.length > 4) {
    const last = titleLines[3] || '';
    titleLines[3] = last.slice(0, Math.max(0, last.length - 1)) + '…';
  }

  // '주일 설교' 라벨을, 오른쪽 테마 표시와 통일감 있게 알약 모양 배지로 그립니다.
  const labelY = 70;
  const labelPillW = 106;
  const labelSvg = `<rect x="${textX}" y="${labelY - 24}" width="${labelPillW}" height="34" rx="17" fill="rgba(201,162,39,0.18)"/>
    <text x="${textX + labelPillW / 2}" y="${labelY}" font-size="18" font-family="${FONT_FAMILY}" font-weight="700" fill="${GOLD}" letter-spacing="1" text-anchor="middle">주일 설교</text>`;

  // 캔버스가 커진 만큼(4:3), 가운데로 몰리지 않도록 위쪽부터 여유 있게 고정 간격으로 배치합니다.
  // 제목을 약 7mm(26px) 아래로, 줄간격은 약 2mm(8px) 더 넓게 조정했습니다.
  lineHeight = 76;
  let y = 256;
  let titleTspans = '';
  for (const line of titleLines) {
    titleTspans += `<text x="${textX}" y="${y}" font-size="${titleFontSize}" font-family="${FONT_FAMILY}" font-weight="900" fill="${WHITE}">${escapeXml(line)}</text>`;
    y += lineHeight;
  }

  y += 60;
  let verseSvg = '';
  if (verseRef) {
    verseSvg = `<text x="${textX}" y="${y}" font-size="26" font-family="${FONT_FAMILY}" font-weight="400" fill="${GOLD}">${escapeXml(verseRef)}</text>`;
    y += 60;
  }

  y += 40;
  const lineY = y;
  y += 50;
  // 교회명 글씨체를 담임목사님 이름과 통일(글씨 굵기를 맞춤), 크기는 기존 교회명 크기(24) 유지
  const churchSvg = `<text x="${textX}" y="${y}" font-size="26" font-family="${FONT_FAMILY_REGULAR}" font-weight="400" fill="${WHITE}">${escapeXml(churchName)}</text>`;
  y += 50;
  const pastorSvg = pastorName
    ? `<text x="${textX}" y="${y}" font-size="26" font-family="${FONT_FAMILY_REGULAR}" font-weight="400" fill="#c8c8c3">${escapeXml(pastorName)}</text>`
    : '';

  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${labelSvg}
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

  if (photoBuffer) {
    // 오려낸 인물 사진은 자르지 않고, 세로 기준으로만 맞춰서 전체가 다 보이게 합니다
    // (사람 실루엣은 사각형이 아니라서, cover로 자르면 머리나 팔이 잘릴 수 있습니다).
    const targetH = Math.round(H * 1.22); // 더 확대
    const cutoutBuf = await sharp(photoBuffer)
      .resize({ height: targetH, fit: 'inside', withoutEnlargement: false })
      .ensureAlpha()
      .png()
      .toBuffer();

    // 투명하게 남는 여백 없이 실제로 보이는 그림만 딱 맞게 잘라냅니다. 이렇게 해야
    // 팔·소매가 잘린 자리가 캔버스 바닥과 정확히 맞닿아서, 공중에 뜬 느낌이 사라집니다.
    const trimmed = await sharp(cutoutBuf).trim().toBuffer();
    const meta = await sharp(trimmed).metadata();
    const cutoutW = meta.width || Math.round(PHOTO_W);
    let cutoutH = meta.height || targetH;

    // 확대하면서 캔버스보다 커질 수 있는데, 머리가 잘리면 안 되니 위쪽은 그대로 두고
    // 아래쪽만 잘라내서 캔버스 안에 맞춥니다.
    let finalCutoutBuf = trimmed;
    if (cutoutH > H) {
      finalCutoutBuf = await sharp(trimmed)
        .extract({ left: 0, top: 0, width: cutoutW, height: H })
        .toBuffer();
      cutoutH = H;
    }

    // 사진 영역(오른쪽) 안에서 가운데 정렬 후 왼쪽으로 살짝(약 1.5cm) 이동, 바닥에 붙입니다.
    const zoneLeft = W - PHOTO_W;
    const SHIFT_LEFT = 133; // 약 3.5cm (1.5cm + 추가 2cm)
    let left = Math.round(zoneLeft + PHOTO_W / 2 - cutoutW / 2) - SHIFT_LEFT;
    const maxLeft = W - cutoutW; // 오른쪽 끝이 캔버스를 넘지 않는 절대 상한 (팔이 잘리지 않도록)
    const minLeft = zoneLeft - 170; // 왼쪽으로 너무 안 가게 하는 하한(선호값)
    if (minLeft <= maxLeft) {
      left = Math.max(minLeft, Math.min(left, maxLeft));
    } else {
      // 사진이 너무 커서 두 기준이 서로 충돌하면, "잘리지 않는 것"을 최우선으로 합니다.
      left = maxLeft;
    }
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
    format: 'jpeg'
  });

  const filename = `sermon-poster-${videoId}-${Date.now()}.jpg`;
  const url = await saveUploadedFile(buffer, filename, 'image/jpeg', uploadsDir);

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
