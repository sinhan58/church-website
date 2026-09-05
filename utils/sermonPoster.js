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
const H = 675;
const PHOTO_W = 480; // 오른쪽 사진 영역 폭 (전체의 40%, 왼쪽 제목 영역이 60%)
const GOLD = '#c9a227';
const WHITE = '#ffffff';
const NAVY = '#0d1526';
const PURPLE = '#241a35';

// ---- 컨셉B 전용 캔버스 (화면이 넓어진 만큼, 세로 비율을 늘려 납작해 보이지 않게 함) ----
// 컨셉A(W/H/PHOTO_W)는 위 값 그대로 절대 안 건드립니다. 아래는 전부 별도 상수입니다.
const W_B = 1300;
const H_B = 950;
const PHOTO_W_B = 480; // 사진 영역은 일단 컨셉A와 동일하게 유지 (추후 수정 예정)

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
  titleLines = titleLines.slice(0, 3);
  if (fullLines.length > 3) {
    const last = titleLines[2] || '';
    titleLines[2] = last.slice(0, Math.max(0, last.length - 1)) + '…';
  }

  // 이미지 안에 작은 라벨을 넣어서, 바깥에 별도 "주일 설교" 제목을 안 둬도 되게 합니다.
  const labelY = 64;
  const labelSvg = `<text x="${textX}" y="${labelY}" font-size="20" font-family="${FONT_FAMILY}" font-weight="700" fill="${GOLD}" letter-spacing="2">주일 설교</text>
    <rect x="${textX}" y="${labelY + 14}" width="46" height="4" fill="${GOLD}"/>`;

  let y = H / 2 - ((titleLines.length - 1) * lineHeight) / 2 - 20;
  let titleTspans = '';
  for (const line of titleLines) {
    titleTspans += `<text x="${textX}" y="${y}" font-size="${titleFontSize}" font-family="${FONT_FAMILY}" font-weight="900" fill="${WHITE}">${escapeXml(line)}</text>`;
    y += lineHeight;
  }

  y += 26;
  let verseSvg = '';
  if (verseRef) {
    verseSvg = `<text x="${textX}" y="${y}" font-size="26" font-family="${FONT_FAMILY}" fill="${GOLD}">${escapeXml(verseRef)}</text>`;
    y += 44;
  }

  y += 16;
  const lineY = y;
  y += 30;
  const churchSvg = `<text x="${textX}" y="${y}" font-size="24" font-family="${FONT_FAMILY}" font-weight="700" fill="${WHITE}">${escapeXml(churchName)}</text>`;
  y += 34;
  const pastorSvg = pastorName
    ? `<text x="${textX}" y="${y}" font-size="19" font-family="${FONT_FAMILY}" fill="#c8c8c3">${escapeXml(pastorName)}</text>`
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

// ---- 컨셉B 전용 텍스트 SVG ----
// 원본(buildTextSvg)과 로직 흐름은 같지만, 좌표·크기 값들만 컨셉B의 넓어진 캔버스(W_B/H_B)에
// 맞게 다시 잡았습니다. 원본 함수는 이 함수와 완전히 독립적이라 서로 영향을 주지 않습니다.
function buildTextSvgB({ title, verseRef, pastorName, churchName }) {
  const textX = 28; // 완전히 붙지 않도록 약간의 여백
  const textMaxWidth = W_B - PHOTO_W_B - textX - 40;

  let titleFontSize = 66;
  let lineHeight = 80;
  let titleLines = wrapByWidth(title, titleFontSize, textMaxWidth, 0.86);
  const fullLines = wrapByWidth(title, titleFontSize, textMaxWidth, 0.86);
  titleLines = titleLines.slice(0, 4); // 세로 공간이 늘어난 만큼 한 줄 더 허용
  if (fullLines.length > 4) {
    const last = titleLines[3] || '';
    titleLines[3] = last.slice(0, Math.max(0, last.length - 1)) + '…';
  }

  const labelY = 72;
  const labelSvg = `<text x="${textX}" y="${labelY}" font-size="23" font-family="${FONT_FAMILY}" font-weight="700" fill="${GOLD}" letter-spacing="2">주일 예배 설교</text>
    <rect x="${textX}" y="${labelY + 16}" width="76" height="4" fill="${GOLD}"/>`;

  // 제목~목사님 성함까지 전체 텍스트 블록을 약 1.2cm(45px) 위로 올려서, 목사님 성함이
  // 캔버스(그리고 실제 카드 박스) 하단 밖으로 밀려나 잘리지 않게 여유를 둡니다.
  const BLOCK_SHIFT_UP = 45;
  let y = H_B / 2 - ((titleLines.length - 1) * lineHeight) / 2 - 20 - BLOCK_SHIFT_UP;
  let titleTspans = '';
  for (const line of titleLines) {
    titleTspans += `<text x="${textX}" y="${y}" font-size="${titleFontSize}" font-family="${FONT_FAMILY}" font-weight="900" fill="${WHITE}">${escapeXml(line)}</text>`;
    y += lineHeight;
  }

  y += 30;
  let verseSvg = '';
  if (verseRef) {
    verseSvg = `<text x="${textX}" y="${y}" font-size="30" font-family="${FONT_FAMILY}" fill="${GOLD}">${escapeXml(verseRef)}</text>`;
    y += 50;
  }

  y += 18;
  const lineY = y;
  y += 34;
  const churchSvg = `<text x="${textX}" y="${y}" font-size="27" font-family="${FONT_FAMILY}" font-weight="700" fill="${WHITE}">${escapeXml(churchName)}</text>`;
  y += 38;
  const pastorSvg = pastorName
    ? `<text x="${textX}" y="${y}" font-size="21" font-family="${FONT_FAMILY}" fill="#c8c8c3">${escapeXml(pastorName)}</text>`
    : '';

  return `
  <svg width="${W_B}" height="${H_B}" xmlns="http://www.w3.org/2000/svg">
    ${labelSvg}
    ${titleTspans}
    ${verseSvg}
    <line x1="${textX}" y1="${lineY}" x2="${textX + 320}" y2="${lineY}" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1"/>
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

// ---- 컨셉B 전용 배경 패널 (캔버스 크기만 W_B/H_B로 다름, 나머지는 동일한 디자인) ----
function buildPanelSvgB() {
  return `
  <svg width="${W_B}" height="${H_B}" xmlns="http://www.w3.org/2000/svg"></svg>`;
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
  format = 'jpeg',
  theme = 'a' // 'b'면 컨셉B 전용 캔버스(W_B/H_B)와 레이아웃을 사용합니다. 그 외에는 항상 기존(컨셉A) 그대로.
}) {
  const isThemeB = theme === 'b';
  // 아래 네 값만 컨셉에 따라 갈립니다 — 나머지 로직(사진 선택, 합성 순서 등)은 완전히 동일합니다.
  const canvasW = isThemeB ? W_B : W;
  const canvasH = isThemeB ? H_B : H;
  const canvasPhotoW = isThemeB ? PHOTO_W_B : PHOTO_W;
  const buildText = isThemeB ? buildTextSvgB : buildTextSvg;
  const buildPanel = isThemeB ? buildPanelSvgB : buildPanelSvg;

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

  const textSvg = buildText({ title, verseRef, pastorName, churchName });
  const panelSvg = buildPanel();

  if (photoBuffer) {
    // 오려낸 인물 사진은 자르지 않고, 세로 기준으로만 맞춰서 전체가 다 보이게 합니다
    // (사람 실루엣은 사각형이 아니라서, cover로 자르면 머리나 팔이 잘릴 수 있습니다).
    // 컨셉B는 캔버스가 늘어난 만큼 사진도 더 크게 키웁니다(사진 하단이 캔버스 맨
    // 아래에 딱 붙도록). 이전에 "잘린다"고 느끼셨던 원인은 사실 이 계산이 아니라
    // CSS 쪽에서 이미지를 아래로 밀어내던 값 때문이었고, 그건 별도로 고쳤습니다.
    // 사진 확대 비율은 항상 컨셉A 캔버스(H=675) 기준으로 계산합니다 — 오늘 처음
    // 만들었을 때 잘 나왔던(안 잘렸던) 바로 그 방식입니다. 컨셉B 캔버스가 세로로
    // 늘어난 건 사진 크기가 아니라 여백 배치에만 씁니다.
    // 컨셉B만: 원본 사진 실측 결과, 사람이 전체 캔버스의 가로 67%·세로 64%만 차지하고
    // 나머지는 흰 여백이었습니다. 이 여백을 먼저 잘라내면(trim), 같은 폭 안에서
    // 사람만 훨씬 크게 보여줄 수 있어서 "커지면 옆으로 넘친다"는 문제 자체가 줄어듭니다.
    let sourceForResize = photoBuffer;
    if (isThemeB) {
      sourceForResize = await sharp(photoBuffer).trim().toBuffer();
    }
    const targetH = Math.round(H * (isThemeB ? 1.06 : 1.06)); // trim으로 이미 커져서, 배율은 안전하게
    const cutoutBuf = await sharp(sourceForResize)
      .resize({ height: targetH, fit: 'inside', withoutEnlargement: false })
      .ensureAlpha()
      .png()
      .toBuffer();
    const meta = await sharp(cutoutBuf).metadata();
    const cutoutW = meta.width || Math.round(canvasPhotoW);
    let cutoutH = meta.height || targetH;

    // 확대하면서 캔버스보다 커질 수 있는데, 머리가 잘리면 안 되니 위쪽은 그대로 두고
    // 아래쪽(강대상 부분)만 잘라내서 캔버스 안에 맞춥니다.
    let finalCutoutBuf = cutoutBuf;
    if (cutoutH > canvasH) {
      finalCutoutBuf = await sharp(cutoutBuf)
        .extract({ left: 0, top: 0, width: cutoutW, height: canvasH })
        .toBuffer();
      cutoutH = canvasH;
    }

    // 사진 영역(오른쪽) 안에서 가운데 정렬 후 왼쪽으로 살짝(약 1.5cm) 이동, 바닥에 붙입니다.
    const zoneLeft = canvasW - canvasPhotoW;
    const SHIFT_LEFT = isThemeB ? 0 : 133; // 컨셉B는 오른쪽으로 최대한 붙게
    let left = Math.round(zoneLeft + canvasPhotoW / 2 - cutoutW / 2) - SHIFT_LEFT;
    left = Math.max(left, zoneLeft - 170); // 너무 왼쪽으로 가지 않도록
    const rightSlack = isThemeB ? 200 : 10;
    left = Math.min(left, canvasW - cutoutW + rightSlack); // 그 다음, 오른쪽으로 넘치지 않도록 (이 제한이 최종적으로 이깁니다)
    const top = Math.max(0, canvasH - cutoutH);

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

async function buildAndCacheSermonPoster({ videoId, rawTitle, videoIndex, uploadsDir, theme = 'a' }) {
  const site = (await readData('site')) || {};
  const pastorName = site.about?.pastorName || '';
  const churchName = site.churchName || '';
  const extraPhotoUrls = Array.isArray(site.sermonCardPhotos) ? site.sermonCardPhotos : [];
  const photoOverride = site.sermonPhotoOverride || '';

  // 컨셉B는 배경을 투명하게 둬서 뒤에 있는 섹션 배경 사진이 비쳐야 하는데, JPG는 투명을
  // 지원하지 않아서 PNG로 만듭니다. 컨셉A(JPG)는 예전 그대로 유지합니다.
  const isThemeB = theme === 'b';
  const format = isThemeB ? 'png' : 'jpeg';

  const buffer = await generateSermonPoster({
    videoId,
    rawTitle,
    extraPhotoUrls,
    pastorName,
    churchName,
    videoIndex,
    photoOverride,
    format,
    theme
  });

  // 컨셉B 이미지는 파일명/캐시 키에 '-b'를 붙여서, 컨셉A 이미지와 절대 서로 덮어쓰지 않게 합니다.
  const cacheKey = isThemeB ? `${videoId}_b` : videoId;
  const ext = isThemeB ? 'png' : 'jpg';
  const mime = isThemeB ? 'image/png' : 'image/jpeg';
  const filename = `sermon-poster-${videoId}${isThemeB ? '-b' : ''}-${Date.now()}.${ext}`;
  const url = await saveUploadedFile(buffer, filename, mime, uploadsDir);

  const posters = (await readData('sermonPosters')) || {};
  posters[cacheKey] = { url, title: rawTitle, createdAt: new Date().toISOString() };
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
