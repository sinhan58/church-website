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
const BUILTIN_PHOTOS = ['pastor-1.png', 'pastor-2.png', 'pastor-3.png']
  .map((f) => path.join(PHOTOS_DIR, f))
  .filter((p) => fs.existsSync(p));

const W = 1200;
const H = 675;
const PHOTO_W = 660; // 왼쪽 사진 영역 폭 (전체의 55%)
const BLEND_W = 140; // 사진과 패널이 자연스럽게 이어지는 페이드 폭
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

// 오른쪽 패널: 보라·남색이 각지게(기하학적으로) 섞인 배경. 사진 쪽 가장자리는
// 페이드 그라데이션으로 처리해서, 사진과 패널이 하나로 자연스럽게 이어지게 합니다.
function buildPanelSvg({ title, verseRef, pastorName, churchName, seed }) {
  const panelX = PHOTO_W - BLEND_W; // 페이드 영역만큼 패널이 사진 쪽으로 살짝 겹쳐 들어감
  const panelW = W - panelX;
  const textX = PHOTO_W + 56;
  const textMaxWidth = W - textX - 56;

  // 기하학적 삼각형 조각들 (시드 기반으로 항상 같은 영상엔 같은 배치가 나오도록)
  const h = seed;
  const shapeSeedA = (h % 40) - 20;
  const shapeSeedB = ((h >> 4) % 30) - 15;

  let titleFontSize = 56;
  let lineHeight = 68;
  let titleLines = wrapByWidth(title, titleFontSize, textMaxWidth, 0.86);
  titleLines = titleLines.slice(0, 3); // 고정 크기 유지, 넘치면 3줄까지만 + 말줄임표
  if (wrapByWidth(title, titleFontSize, textMaxWidth, 0.86).length > 3) {
    const last = titleLines[2] || '';
    titleLines[2] = last.slice(0, Math.max(0, last.length - 1)) + '…';
  }

  let y = H / 2 - ((titleLines.length - 1) * lineHeight) / 2 - 40;
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
    <defs>
      <linearGradient id="basePanel" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${NAVY}"/>
        <stop offset="100%" stop-color="${PURPLE}"/>
      </linearGradient>
      <linearGradient id="fadeIn" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${NAVY}" stop-opacity="0"/>
        <stop offset="100%" stop-color="${NAVY}" stop-opacity="1"/>
      </linearGradient>
      <clipPath id="panelClip">
        <rect x="${panelX}" y="0" width="${panelW}" height="${H}"/>
      </clipPath>
    </defs>

    <g clip-path="url(#panelClip)">
      <rect x="${panelX}" y="0" width="${panelW}" height="${H}" fill="url(#basePanel)"/>
      <!-- 기하학적 조각들: 각진 삼각형/사각형을 낮은 투명도로 겹쳐서 밋밋하지 않게 -->
      <polygon points="${panelX + 60 + shapeSeedA},0 ${panelX + 340 + shapeSeedA},0 ${panelX + 120},${H}" fill="${GOLD}" opacity="0.06"/>
      <polygon points="${W - 260},${H} ${W},${H} ${W},${H - 300 + shapeSeedB}" fill="${GOLD}" opacity="0.08"/>
      <polygon points="${panelX},${H * 0.62} ${panelX + 420},${H * 0.4} ${panelX + 260},${H}" fill="#3a1a55" opacity="0.35"/>
      <rect x="${panelX}" y="0" width="${BLEND_W + 30}" height="${H}" fill="url(#fadeIn)"/>
    </g>

    ${titleTspans}
    ${verseSvg}
    <line x1="${textX}" y1="${lineY}" x2="${textX + 280}" y2="${lineY}" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1"/>
    ${churchSvg}
    ${pastorSvg}

    <rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="${GOLD}" stroke-width="2" opacity="0.9"/>
  </svg>`;
}

/**
 * "이번 주일 설교" 히어로 카드 포스터 이미지(PNG/JPEG 버퍼)를 생성합니다.
 * 사람을 오려내지 않고, 사진 전체를 왼쪽 영역에 꽉 채워(cover) 넣습니다.
 */
async function generateSermonPoster({
  videoId,
  rawTitle,
  extraPhotoUrls = [],
  pastorName = '',
  churchName = '',
  videoIndex = null,
  format = 'jpeg'
}) {
  const { verseRef, title } = parseSermonTitle(rawTitle);
  const h = hashStr(videoId);

  const localPool = BUILTIN_PHOTOS;
  let photoBuffer = null;
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

  const panelSvg = buildPanelSvg({ title, verseRef, pastorName, churchName, seed: h });

  const layers = [];

  if (photoBuffer) {
    // 사람을 오려내지 않고, 사진 전체를 왼쪽 영역에 꽉 채웁니다(object-fit: cover와 동일한 방식).
    // 어떤 비율의 사진이 들어와도 항상 안정적으로 같은 크기의 박스에 맞춰집니다.
    const photoBuf = await sharp(photoBuffer)
      .resize({ width: PHOTO_W, height: H, fit: 'cover', position: 'attention' })
      .toBuffer();
    layers.push({ input: photoBuf, top: 0, left: 0 });
  }

  layers.push({ input: Buffer.from(panelSvg), top: 0, left: 0 });

  const base = photoBuffer
    ? sharp({ create: { width: W, height: H, channels: 3, background: NAVY } })
    : sharp(Buffer.from(panelSvg));

  const composed = photoBuffer ? base.composite(layers) : sharp(Buffer.from(panelSvg));

  return format === 'png' ? composed.png().toBuffer() : composed.jpeg({ quality: 88 }).toBuffer();
}

const { readData, writeData, saveUploadedFile } = require('./db');

async function buildAndCacheSermonPoster({ videoId, rawTitle, videoIndex, uploadsDir }) {
  const site = (await readData('site')) || {};
  const pastorName = site.about?.pastorName || '';
  const churchName = site.churchName || '';
  const extraPhotoUrls = Array.isArray(site.sermonCardPhotos) ? site.sermonCardPhotos : [];

  const buffer = await generateSermonPoster({
    videoId,
    rawTitle,
    extraPhotoUrls,
    pastorName,
    churchName,
    videoIndex,
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
    for (let i = 0; i < targets.length; i++) {
      const v = targets[i];
      const cached = posters[v.videoId];
      if (cached && cached.title === v.title && cached.url) continue;
      await buildAndCacheSermonPoster({ videoId: v.videoId, rawTitle: v.title, videoIndex: i, uploadsDir });
    }
  } catch (err) {
    console.error('[sermonPoster] 설교 카드 미리 생성 중 오류(다음 요청 시 다시 시도됩니다):', err.message);
  }
}

module.exports = {
  generateSermonPoster,
  parseSermonTitle,
  buildAndCacheSermonPoster,
  pregenerateMissingSermonPosters
};
