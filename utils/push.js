const webpush = require('web-push');
const { readData, writeData } = require('./db');

// VAPID 키: 푸시 알림을 보낼 때 "이 서버가 진짜 우리 서버가 맞다"는 걸 증명하는 열쇠입니다.
// 반드시 환경변수(Render의 Environment 설정)에 등록해서 써야 합니다. 코드에 직접 적어두면
// 깃허브에 그대로 노출되어 보안상 위험합니다.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

let vapidReady = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:admin@muldaen.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidReady = true;
} else {
  console.warn('[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 환경변수가 없어 푸시 알림이 비활성화됩니다.');
}

// 새 구독을 저장합니다 (같은 기기가 다시 구독하면 기존 것을 덮어씀).
async function saveSubscription(subscription) {
  const subs = (await readData('pushSubscriptions')) || [];
  const filtered = subs.filter((s) => s.endpoint !== subscription.endpoint);
  filtered.push({ ...subscription, savedAt: new Date().toISOString() });
  await writeData('pushSubscriptions', filtered);
}

async function removeSubscription(endpoint) {
  const subs = (await readData('pushSubscriptions')) || [];
  const filtered = subs.filter((s) => s.endpoint !== endpoint);
  await writeData('pushSubscriptions', filtered);
}

// 저장된 모든 구독자에게 알림을 보냅니다. 이미 만료되었거나 구독이 취소된 기기(410/404
// 오류)는 발송 과정에서 자동으로 목록에서 정리합니다.
async function sendToAll({ title, body, url }) {
  if (!vapidReady) {
    return { sent: 0, failed: 0, error: 'VAPID 키가 설정되지 않았습니다.' };
  }
  const subs = (await readData('pushSubscriptions')) || [];
  const payload = JSON.stringify({ title, body, url: url || '/' });

  let sent = 0;
  let failed = 0;
  const stillValid = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        );
        sent += 1;
        stillValid.push(sub);
      } catch (err) {
        failed += 1;
        // 410(Gone)/404(Not Found)는 더 이상 유효하지 않은 구독이라 목록에서 뺍니다.
        if (err.statusCode !== 410 && err.statusCode !== 404) {
          stillValid.push(sub); // 일시적 오류일 수 있으니 그 외 오류는 유지
        }
      }
    })
  );

  await writeData('pushSubscriptions', stillValid);
  return { sent, failed };
}

module.exports = { VAPID_PUBLIC_KEY, saveSubscription, removeSubscription, sendToAll };
