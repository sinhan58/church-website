// 간단한 "시도 횟수 제한" 도구 (외부 패키지 없이 서버 메모리에서 동작)
//
// - 관리자 로그인, 비밀글 비밀번호 확인처럼 비밀번호를 계속 대입해 보는 공격을 막고,
// - 기도요청·문의·영수증 신청·아멘·퀴즈 제출 같은 공개 입력의 도배를 막습니다.
//
// 서버가 재시작되면 기록은 초기화됩니다(정상 이용에는 영향 없음).

const buckets = new Map(); // key -> { count, resetAt }

// 오래된 기록 정리 (10분마다)
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref();

// 접속한 사람의 IP. Render 같은 호스팅은 앞단 프록시가 실제 주소를 x-forwarded-for에 넣어줍니다.
function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '');
  const first = xff.split(',')[0].trim();
  return first || req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function hit(key, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  return b;
}

function peek(key) {
  const b = buckets.get(key);
  if (!b || b.resetAt <= Date.now()) return 0;
  return b.count;
}

function retryMinutes(key) {
  const b = buckets.get(key);
  if (!b) return 1;
  return Math.max(1, Math.ceil((b.resetAt - Date.now()) / 60000));
}

// (1) 요청 수 자체를 제한하는 미들웨어 (도배 방지용)
//     예: limitRequests({ name: 'prayer-post', max: 5, windowMs: 10 * 60 * 1000 })
function limitRequests({ name, max, windowMs, message }) {
  return (req, res, next) => {
    const key = `${name}:${clientIp(req)}`;
    const b = hit(key, windowMs);
    if (b.count > max) {
      return res.status(429).json({
        error: message || `요청이 너무 많습니다. ${retryMinutes(key)}분 후에 다시 시도해주세요.`
      });
    }
    next();
  };
}

// (2) "실패"만 세는 제한 (비밀번호 대입 방지용)
//     keys: 이 시도를 셀 기준들(예: IP, 아이디, 게시글 id). 하나라도 한도를 넘으면 잠깁니다.
//     IP만 기준으로 하면 IP를 바꿔가며 공격할 수 있어서, 대상(아이디·게시글) 기준도 함께 셉니다.
function failureGuard({ name, max, windowMs }) {
  const fullKeys = (keys) => keys.filter(Boolean).map((k) => `${name}:${k}`);
  return {
    isLocked(keys) {
      const ks = fullKeys(keys);
      const locked = ks.find((k) => peek(k) >= max);
      return locked ? retryMinutes(locked) : 0; // 잠겼으면 남은 분, 아니면 0
    },
    fail(keys) {
      fullKeys(keys).forEach((k) => hit(k, windowMs));
    }
  };
}

module.exports = { clientIp, limitRequests, failureGuard };
