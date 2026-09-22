// 성경 리더의 "카카오 로그인" 신원 확인을 위한 아주 가벼운 자체 쿠키 모듈입니다.
// - express-session(관리자 로그인용, server.js 참고)과는 완전히 분리된 별도의 쿠키를
//   직접 만들어 씁니다. 이유: 관리자 세션은 보안상 8시간짜리로 짧게 유지해야 하는데,
//   성경 읽기 기록은 "지속 관리"가 목적이라 훨씬 오래(1년) 유지되어야 하기 때문입니다.
//   express-session 하나를 같이 쓰면 두 요구사항이 충돌해서, 아예 독립된 서명 쿠키를
//   직접 만들었습니다.
// - 쿠키 안에는 카카오 회원번호(숫자 id)만 담기고, 조작 방지를 위해 SESSION_SECRET으로
//   서명합니다(HMAC-SHA256). 그래서 새 패키지(cookie-parser 등) 설치 없이도 안전하게
//   "이 요청을 보낸 사람이 로그인했던 그 카카오 계정이 맞는지"를 확인할 수 있습니다.

const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const COOKIE_NAME = 'bible_uid';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 365; // 1년

function sign(value) {
  const h = crypto.createHmac('sha256', SECRET).update(value).digest('hex');
  return `${value}.${h}`;
}

function verify(signed) {
  if (!signed) return null;
  const idx = signed.lastIndexOf('.');
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac('sha256', SECRET).update(value).digest('hex');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
  } catch (e) {
    return null;
  }
  return value;
}

// cookie-parser 없이도 요청 헤더에서 쿠키를 직접 읽어옵니다.
function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch (e) {
      out[k] = v;
    }
  });
  return out;
}

// 요청에 유효한 로그인 쿠키가 있으면 카카오 회원번호(문자열)를, 없으면 null을 반환합니다.
function getKakaoIdFromReq(req) {
  const cookies = parseCookies(req);
  return verify(cookies[COOKIE_NAME]);
}

function setLoginCookie(res, kakaoId) {
  res.cookie(COOKIE_NAME, sign(String(kakaoId)), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: MAX_AGE_MS,
    path: '/'
  });
}

function clearLoginCookie(res) {
  // 처음 쿠키를 심을 때 쓴 옵션(httpOnly, sameSite, path)과 최대한 똑같이 맞춰서 지워야
  // 일부 브라우저에서 "다른 쿠키"로 취급해 삭제가 안 먹는 문제가 생기지 않습니다.
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', path: '/' });
}

module.exports = { getKakaoIdFromReq, setLoginCookie, clearLoginCookie };
