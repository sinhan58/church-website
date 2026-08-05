(function () {
  const $ = (sel) => document.querySelector(sel);

  $('#receipt-year').textContent = new Date().getFullYear();

  fetch('/api/site')
    .then((res) => res.json())
    .then((site) => {
      if (site && site.churchName) {
        document.title = `기부금 영수증 신청 | ${site.churchName}`;
        $('#receipt-brand').textContent = site.churchName;
        $('#receipt-footer-name').textContent = site.churchName;
      }
    })
    .catch(() => {});

  $('#receipt-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = $('#receipt-status');
    const payload = {
      name: $('#receipt-name').value.trim(),
      phone: $('#receipt-phone').value.trim(),
      email: $('#receipt-email').value.trim(),
      note: $('#receipt-note').value.trim()
    };
    if (!payload.name || !payload.phone) return;

    try {
      const res = await fetch('/api/receipt-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error();
      statusEl.textContent = '신청이 접수되었습니다. 확인 후 연락드릴게요.';
      $('#receipt-form').reset();
    } catch {
      statusEl.textContent = '신청 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
    }
  });
})();
