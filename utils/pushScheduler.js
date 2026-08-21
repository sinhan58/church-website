const cron = require('node-cron');
const { readData, writeData } = require('./db');
const { sendToAll } = require('./push');

// 1분마다 '예약된 알림' 목록을 확인해서, 예약 시각이 지난 것들을 자동으로 발송합니다.
// 관리자가 큐티·말씀 퀴즈를 등록하면서 "알림 예약하기"를 체크했을 때 여기 등록되고,
// 글을 삭제하면 연결된 예약도 같이 취소되도록 routes/admin.js에서 처리합니다.
function startPushScheduler() {
  cron.schedule('* * * * *', async () => {
    try {
      const scheduled = (await readData('scheduledPushes')) || [];
      const now = new Date();
      const due = scheduled.filter((s) => s.status === 'pending' && new Date(s.sendAt) <= now);

      if (due.length > 0) {
        for (const item of due) {
          try {
            await sendToAll({ title: item.title, body: item.body, url: item.url, image: item.image || undefined });
            item.status = 'sent';
            item.sentAt = new Date().toISOString();
          } catch (err) {
            item.status = 'failed';
            item.error = err.message;
          }
        }
      }

      // 발송이 끝났거나(성공/실패) 취소된 지 60일 넘은 기록은 목록이 끝없이 쌓이지
      // 않도록 자동으로 정리합니다. 아직 발송 전(대기중)인 예약은 건드리지 않습니다.
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const cleaned = scheduled.filter((s) => {
        if (s.status === 'pending') return true;
        const referenceTime = new Date(s.sentAt || s.createdAt || now);
        return referenceTime > sixtyDaysAgo;
      });

      if (due.length > 0 || cleaned.length !== scheduled.length) {
        await writeData('scheduledPushes', cleaned);
      }
    } catch (err) {
      console.error('[push-scheduler] 예약 알림 확인 중 오류:', err.message);
    }
  });
  console.log('✅ 예약 알림 스케줄러 시작됨 (1분마다 확인, 60일 지난 완료 기록은 자동 정리)');
}

module.exports = { startPushScheduler };
