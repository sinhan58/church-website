// ===================================================================
// 교회 소개 "소개 본문" 리치 텍스트 에디터 (Quill)
// index_thml_admin_.html 에 <script> 태그로 이 파일을 따로 불러오면 됩니다.
// (Quill 라이브러리는 이미 페이지에 로드되어 있다는 전제로 작성했습니다.)
//
// 동작 방식:
// - 원래 있던 <textarea id="s-aboutBody">는 화면에서만 숨기고 그대로 둡니다.
//   기존 "기본 정보 저장" 버튼(어디에 있는지 모르는 admin.js 안의 로직)이
//   이 textarea의 값을 읽어서 저장하는 구조라, 건드리지 않아야 저장이 계속 됩니다.
// - 대신 그 자리에 Quill 에디터를 띄우고, 내용이 바뀔 때마다 textarea.value를
//   똑같이 업데이트해서 "겉보기엔 Quill, 실제 저장은 기존 방식 그대로"가 되게 합니다.
// - 페이지 로드 시 기존 admin.js가 textarea에 값을 채워 넣는 타이밍을 모르기 때문에,
//   짧게 폴링하면서 값이 채워지는 순간을 감지해 Quill에 반영합니다.
// ===================================================================
(function () {
  const textarea = document.querySelector('#s-aboutBody');
  const mount = document.querySelector('#s-aboutBody-quill');
  if (!textarea || !mount || typeof Quill === 'undefined') return;

  // 정렬/글씨크기를 클래스가 아니라 인라인 style로 저장하도록 설정
  // (홈페이지 쪽에서 별도 CSS 클래스 없이 그대로 렌더링할 수 있게 하기 위함)
  const AlignStyle = Quill.import('attributors/style/align');
  const SizeStyle = Quill.import('attributors/style/size');
  SizeStyle.whitelist = ['14px', false, '20px', '26px'];
  Quill.register(AlignStyle, true);
  Quill.register(SizeStyle, true);

  const quill = new Quill(mount, {
    theme: 'snow',
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline'],
        [{ align: [] }],
        [{ size: ['14px', false, '20px', '26px'] }],
        ['clean']
      ]
    }
  });

  let syncingFromTextarea = false;

  function pushQuillToTextarea() {
    if (syncingFromTextarea) return;
    // 내용이 비어있을 때 Quill이 남기는 빈 <p><br></p>는 저장하지 않고 빈 문자열로
    const html = quill.getText().trim() === '' ? '' : quill.root.innerHTML;
    textarea.value = html;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }

  quill.on('text-change', pushQuillToTextarea);

  // 기존 admin.js가 비동기로 textarea 값을 채워 넣는 타이밍을 기다렸다가,
  // 값이 처음 채워지는 순간 딱 한 번 Quill에 반영합니다.
  let attempts = 0;
  const maxAttempts = 50; // 200ms x 50 = 10초까지 대기
  const poll = setInterval(() => {
    attempts += 1;
    if (textarea.value) {
      syncingFromTextarea = true;
      quill.root.innerHTML = textarea.value;
      syncingFromTextarea = false;
      clearInterval(poll);
    } else if (attempts >= maxAttempts) {
      clearInterval(poll);
    }
  }, 200);
})();
