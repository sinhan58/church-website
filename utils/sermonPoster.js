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

// 오른쪽 패널: 별도의 색상 그라데이션이 아니라, "같은 사진을 흐릿하고 어둡게 늘린 것"을
// 배경으로 씁니다. 사진과 배경이 같은 원본에서 나오기 때문에 색감이 항상 자연스럽게
// 이어지고, 사진이 바뀌어도 늘 어울리는 결과가 나옵니다.
function buildTextSvg({ title, verseRef, pastorName, churchName }) {
  const textX = PHOTO_W + 56;
  const textMaxWidth = W - textX - 56;

  let titleFontSize = 56;
  let lineHeight = 68;
  let titleLines = wrapByWidth(title, titleFontSize, textMaxWidth, 0.86);
  const fullLines = wrapByWidth(title, titleFontSize, textMaxWidth, 0.86);
  titleLines = titleLines.slice(0, 3);
  if (fullLines.length > 3) {
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
    ${titleTspans}
    ${verseSvg}
    <line x1="${textX}" y1="${lineY}" x2="${textX + 280}" y2="${lineY}" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1"/>
    ${churchSvg}
    ${pastorSvg}
  </svg>`;
}

// 글자가 항상 잘 읽히도록, 오른쪽 텍스트 구역에만 어두운 그라데이션을 얹습니다
// (사진이 밝든 어둡든 상관없이 대비를 보장).
function buildDarkenOverlaySvg() {
  const startX = PHOTO_W - BLEND_W;
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="darken" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="${Math.round((startX / W) * 100)}%" stop-color="#000000" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
      </linearGradient>
    </defs>
    <rect x="${startX}" y="0" width="${W - startX}" height="${H}" fill="url(#darken)"/>
  </svg>`;
}

// 왼쪽 사진의 오른쪽 가장자리를 부드럽게 투명해지도록 만드는 마스크 (사진↔배경 경계를 없앰)
function buildFeatherMaskSvg() {
  const opaqueEnd = Math.round(((PHOTO_W - BLEND_W) / PHOTO_W) * 100);
  return `
  <svg width="${PHOTO_W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="white" stop-opacity="1"/>
        <stop offset="${opaqueEnd}%" stop-color="white" stop-opacity="1"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${PHOTO_W}" height="${H}" fill="url(#fade)"/>
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

  const textSvg = buildTextSvg({ title, verseRef, pastorName, churchName });

  if (photoBuffer) {
    // 1) 캔버스 전체를 채우는 "같은 사진"을 흐릿하고 어둡게 늘려서 배경으로 씁니다.
    //    사진과 배경이 같은 원본에서 나오므로 색감이 항상 자연스럽게 이어집니다.
    const blurredBg = await sharp(photoBuffer)
      .resize({ width: W, height: H, fit: 'cover', position: 'attention' })
      .blur(48)
      .modulate({ brightness: 0.5, saturation: 0.85 })
      .toBuffer();

    // 2) 선명한 원본 사진을 왼쪽에 놓되, 오른쪽 가장자리는 부드럽게 투명해지도록
    //    마스크를 씌워서 경계 없이 배경 속으로 스며들게 합니다.
    //    (반드시 PNG로 변환해야 합니다 - JPEG는 투명도를 표현할 수 없어서, 그대로 두면
    //    페더 마스크가 적용되지 않고 사진 전체가 흐려 보이는 원인이 됩니다)
    const sharpPhotoPng = await sharp(photoBuffer)
      .resize({ width: PHOTO_W, height: H, fit: 'cover', position: 'attention' })
      .ensureAlpha()
      .png()
      .toBuffer();
    const feathered = await sharp(sharpPhotoPng)
      .composite([{ input: Buffer.from(buildFeatherMaskSvg()), blend: 'dest-in' }])
      .png()
      .toBuffer();

    return sharp(blurredBg)
      .composite([
        { input: feathered, left: 0, top: 0 },
        { input: Buffer.from(buildDarkenOverlaySvg()), left: 0, top: 0 },
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
