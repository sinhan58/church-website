// 카카오 로그인 REST API 호출을 모아둔 아주 작은 모듈입니다.
// - "인가 코드"(code)를 실제 접근 토큰으로 바꾸고, 그 토큰으로 사용자 고유 회원번호를
//   받아오는 딱 두 가지 일만 합니다. Node 18+ 에는 fetch가 내장되어 있어 별도 패키지
//   설치가 필요 없습니다(Render 배포 로그에서 이미 Node 26대를 쓰고 있는 걸 확인했습니다).
// - REST API 키/Client Secret은 여기(서버)에서만 쓰고, 절대 브라우저로 내려보내지 않습니다.
//   (브라우저에는 JavaScript 키만 내려보냅니다 — routes/api.js의 /bible/kakao-config 참고)

async function exchangeCodeForToken(code, redirectUri) {
  const params = new URLSearchParams();
  params.set('grant_type', 'authorization_code');
  params.set('client_id', process.env.KAKAO_REST_API_KEY || '');
  params.set('redirect_uri', redirectUri);
  params.set('code', code);
  // 카카오 앱의 [카카오 로그인 > 보안] 탭에서 Client Secret을 "사용함"으로 켜둔 경우에만
  // 필요합니다. 켜두지 않았다면 이 값이 없어도 정상 동작합니다.
  if (process.env.KAKAO_CLIENT_SECRET) {
    params.set('client_secret', process.env.KAKAO_CLIENT_SECRET);
  }

  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: params.toString()
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || '카카오 토큰 발급에 실패했습니다.');
  }
  return data.access_token;
}

async function fetchKakaoUser(accessToken) {
  const res = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  if (!res.ok || !data.id) {
    throw new Error((data && data.msg) || '카카오 사용자 정보 조회에 실패했습니다.');
  }
  return data; // { id, kakao_account: { profile: { nickname, ... } } | undefined, ... }
}

module.exports = { exchangeCodeForToken, fetchKakaoUser };
