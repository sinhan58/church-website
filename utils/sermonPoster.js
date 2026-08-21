// 설교 섹션 왼쪽 "이번 주일 설교" 히어로 카드용 포스터 이미지를 만드는 모듈입니다.
// - 사람을 배경에서 오려내지 않고, 사진 전체를 그대로 왼쪽에 채워 넣습니다(항상 안전하고 일정한 결과).
// - 오른쪽엔 보라·남색 계열이 기하학적으로 섞인 그라데이션 패널 위에 제목·구절·교회명·목사님 성함만 고정 크기로 표시합니다.
// - 이제 카드가 한 장(이번 주 최신 설교)만 필요하므로, 다양한 사진 여러 장을 동시에 예쁘게
//   맞춰야 하는 부담이 없어져서 훨씬 안정적인 결과가 나옵니다.
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
const BLEND_W = 190; // 사진과 패널이 자연스럽게 이어지는 페이드 폭
const GOLD = '#c9a227';
const WHITE = '#ffffff';

// 직선(1차) 변화 대신, 완만하게 시작해서 중간에 빠르게, 다시 완만하게 끝나는 S자 곡선으로
// 값이 바뀌게 합니다. 사람 눈에는 이 방식이 직선 변화보다 훨씬 자연스럽게 느껴집니다.
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// startVal -> endVal로 곡선을 그리며 변하는 SVG 그라데이션 stop 문자열을 만듭니다.
function easedStops(startVal, endVal, steps = 8) {
  const stops = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const eased = smoothstep(t);
    const val = startVal + (endVal - startVal) * eased;
    stops.push({ pct: Math.round(t * 100), val: Math.max(0, Math.min(1, val)) });
  }
  return stops;
}

function easedOpacityStops(color, startOpacity, endOpacity, steps = 8) {
  return easedStops(startOpacity, endOpacity, steps)
    .map((s) => `<stop offset="${s.pct}%" stop-color="${color}" stop-opacity="${s.val.toFixed(3)}"/>`)
    .join('');
}
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

// 오른쪽 패널: 별도의 색상 그라데이션이 아니라, "같은 사진을 흐릿하고 어둡게 늘린 것"을
// 배경으로 씁니다. 사진과 배경이 같은 원본에서 나오기 때문에 색감이 항상 자연스럽게
// 이어지고, 사진이 바뀌어도 늘 어울리는 결과가 나옵니다.
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

// 글자가 항상 잘 읽히도록, 왼쪽 텍스트 구역에만 어두운 그라데이션을 얹습니다
// (사진이 밝든 어둡든 상관없이 대비를 보장).
function buildDarkenOverlaySvg() {
  const endX = W - PHOTO_W; // 사진이 시작되는 지점까지만 (사진 쪽과 겹치지 않게)
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="darken" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${endX}" y2="0">
        ${easedOpacityStops('#000000', 0.5, 0.15, 10).split('/>').join('/>\n        ')}
      </linearGradient>
      <radialGradient id="tealGlow" cx="15%" cy="10%" r="65%">
        <stop offset="0%" stop-color="#0f8f9a" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#0f8f9a" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="wineGlow" cx="88%" cy="92%" r="55%">
        <stop offset="0%" stop-color="#7a1f3d" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#7a1f3d" stop-opacity="0"/>
      </radialGradient>
      <filter id="colorBlur"><feGaussianBlur stdDeviation="60"/></filter>
    </defs>
    <!-- 어두운 남색 바탕에, 청록(왼쪽 위)·와인색(오른쪽 아래)을 아주 은은하게만 스치듯 넣습니다 -->
    <rect x="0" y="0" width="${endX}" height="${H}" fill="${NAVY}"/>
    <g filter="url(#colorBlur)">
      <rect x="0" y="0" width="${endX}" height="${H}" fill="url(#tealGlow)"/>
      <rect x="0" y="0" width="${endX}" height="${H}" fill="url(#wineGlow)"/>
    </g>
    <rect x="0" y="0" width="${endX}" height="${H}" fill="url(#darken)"/>
  </svg>`;
}

// 오른쪽 사진의 왼쪽 가장자리를 부드럽게 투명해지도록 만드는 마스크 (사진↔배경 경계를 없앰).
// 직선이 아니라 완만↔빠름↔완만의 S자 곡선으로 값이 바뀌어서 훨씬 자연스럽습니다.
function buildFeatherMaskSvg() {
  const fadePct = (BLEND_W / PHOTO_W) * 100;
  const stops = easedStops(0, 1, 10)
    .map((s) => `<stop offset="${((s.pct / 100) * fadePct).toFixed(1)}%" stop-color="white" stop-opacity="${s.val.toFixed(3)}"/>`)
    .join('\n        ');
  return `
  <svg width="${PHOTO_W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0%" y1="0%" x2="100%" y2="0%">
        ${stops}
        <stop offset="100%" stop-color="white" stop-opacity="1"/>
      </linearGradient>
    </defs>
    <rect width="${PHOTO_W}" height="${H}" fill="url(#fade)"/>
  </svg>`;
}

// 사진 자체를 페이드 구간에서 미리 어둡게 만듭니다. 투명도만 줄이면, 흰 강대상처럼
// 밝은 사물이 어두운 배경 속으로 갑자기 "뚝" 끊겨 사라지는 것처럼 보입니다. 밝기도
// 같이 서서히(곡선으로) 줄여주면, 경계가 훨씬 부드러워집니다.
function buildPhotoDarkenGradientSvg() {
  const fadePct = (BLEND_W / PHOTO_W) * 100;
  const stops = easedStops(0.88, 0, 10)
    .map((s) => `<stop offset="${((s.pct / 100) * fadePct).toFixed(1)}%" stop-color="#000000" stop-opacity="${s.val.toFixed(3)}"/>`)
    .join('\n        ');
  return `
  <svg width="${PHOTO_W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pdark" x1="0%" y1="0%" x2="100%" y2="0%">
        ${stops}
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${PHOTO_W}" height="${H}" fill="url(#pdark)"/>
  </svg>`;
}

// 돌벽 같은 "결이 있는" 사진은 밝기·투명도만 줄여도 무늬 자체가 경계처럼 보일 수 있습니다.
// 경계 구간에서 흐린 버전을 곡선으로 겹쳐 씌워서, 선명도 자체도 함께 서서히 사라지게 합니다.
function buildBlurRevealMaskSvg() {
  const fadePct = (Math.min(BLEND_W * 1.15, PHOTO_W) / PHOTO_W) * 100;
  const stops = easedStops(1, 0, 10)
    .map((s) => `<stop offset="${((s.pct / 100) * fadePct).toFixed(1)}%" stop-color="white" stop-opacity="${s.val.toFixed(3)}"/>`)
    .join('\n        ');
  return `
  <svg width="${PHOTO_W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="blurReveal" x1="0%" y1="0%" x2="100%" y2="0%">
        ${stops}
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${PHOTO_W}" height="${H}" fill="url(#blurReveal)"/>
  </svg>`;
}

// 완벽하게 안 보이는 경계를 노리는 대신, 얇고 은은한 "유리질감" 띠를 경계에 의도적으로
// 얹습니다. 프로필트 앱들이 자주 쓰는 방식으로, "여기는 원래 이렇게 디자인된 구분선"
// 처럼 보이게 해서 오히려 고급스러운 느낌을 줍니다.
function buildGlassDividerSvg() {
  const seamX = W - PHOTO_W;
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="glass" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="50%" stop-color="#ffffff" stop-opacity="0.14"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <filter id="glassBlur"><feGaussianBlur stdDeviation="22"/></filter>
    </defs>
    <rect x="${seamX - 70}" y="0" width="140" height="${H}" fill="url(#glass)" filter="url(#glassBlur)"/>
  </svg>`;
}

/**
 * "이번 주일 설교" 히어로 카드 포스터 이미지(PNG/JPEG 버퍼)를 생성합니다.
 * 사람을 오려내지 않고, 사진 전체를 왼쪽 영역에 꽉 채워(cover) 넣습니다.
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
  photoOverride = '', // 관리자가 직접 고른 사진 파일명 (예: 'pastor-podium.png'). 있으면 이걸 최우선으로 씁니다.
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

  if (photoBuffer) {
    // 1) 캔버스 전체를 채우는 "같은 사진"을 흐릿하고 어둡게 늘려서 배경으로 씁니다.
    //    사진과 배경이 같은 원본에서 나오므로 색감이 항상 자연스럽게 이어집니다.
    const blurredBg = await sharp(photoBuffer)
      .resize({ width: W, height: H, fit: 'cover', position: 'attention' })
      .blur(48)
      .modulate({ brightness: 0.5, saturation: 0.85 })
      .toBuffer();

    // 2) 선명한 원본 사진을 오른쪽에 놓되, 왼쪽 가장자리는 부드럽게 투명해지도록
    //    마스크를 씌워서 경계 없이 배경 속으로 스며들게 합니다.
    //    (반드시 PNG로 변환해야 합니다 - JPEG는 투명도를 표현할 수 없어서, 그대로 두면
    //    페더 마스크가 적용되지 않고 사진 전체가 흐려 보이는 원인이 됩니다)
    // 사진을 한 번만 잘라서(기준 프레이밍 통일), 선명한 버전과 흐린 버전을 그 결과에서
    // 함께 파생시킵니다. 따로따로 자르면 자동 구도 인식이 버전마다 미세하게 달라져
    // 경계가 어긋나 보일 수 있어 이렇게 통일합니다.
    const croppedBase = await sharp(photoBuffer)
      .resize({ width: PHOTO_W, height: H, fit: 'cover', position: 'attention' })
      .toBuffer();

    const sharpPhotoPng = await sharp(croppedBase).ensureAlpha().png().toBuffer();

    // 경계 구간에서 사진 자체를 점점 흐리게 만듭니다 (돌벽 같은 결이 있는 사진도
    // 무늬가 갑자기 끊기지 않고 선명도부터 서서히 사라지도록).
    const softenedCrop = await sharp(croppedBase).blur(22).ensureAlpha().png().toBuffer();
    const softenedRevealed = await sharp(softenedCrop)
      .composite([{ input: Buffer.from(buildBlurRevealMaskSvg()), blend: 'dest-in' }])
      .png()
      .toBuffer();
    const softEdgedPhoto = await sharp(sharpPhotoPng)
      .composite([{ input: softenedRevealed }])
      .png()
      .toBuffer();

    // 밝기를 서서히 줄이고, 그다음 투명도를 서서히 줄입니다 (선명도 → 밝기 → 투명도 순서로
    // 세 단계가 겹쳐지며 훨씬 부드럽게 배경 속으로 스며듭니다).
    const darkenedPhoto = await sharp(softEdgedPhoto)
      .composite([{ input: Buffer.from(buildPhotoDarkenGradientSvg()) }])
      .png()
      .toBuffer();
    const feathered = await sharp(darkenedPhoto)
      .composite([{ input: Buffer.from(buildFeatherMaskSvg()), blend: 'dest-in' }])
      .png()
      .toBuffer();

    return sharp(blurredBg)
      .composite([
        { input: feathered, left: W - PHOTO_W, top: 0 },
        { input: Buffer.from(buildDarkenOverlaySvg()), left: 0, top: 0 },
        { input: Buffer.from(buildGlassDividerSvg()), left: 0, top: 0 },
        { input: Buffer.from(textSvg), left: 0, top: 0 }
      ])
      [format === 'png' ? 'png' : 'jpeg'](format === 'png' ? undefined : { quality: 88 })
      .toBuffer();
  }

  // 사진이 아예 없을 때를 대비한 기본 배경
  const fallback = sharp({ create: { width: W, height: H, channels: 3, background: NAVY } }).composite([
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
