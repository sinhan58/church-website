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
  if (!textarea || !mount) return;

  function fallbackToPlainTextarea(reason) {
    console.error('소개 본문 리치 에디터 초기화 실패:', reason);
    textarea.style.display = ''; // 원래 입력창을 다시 보이게 해서 최소한 편집은 가능하게
    const notice = document.createElement('p');
    notice.className = 'hint';
    notice.style.color = '#b3413a';
    notice.textContent = '리치 에디터를 불러오지 못해 기본 입력창으로 표시합니다. (' + reason + ')';
    mount.replaceWith(notice);
  }

  if (typeof Quill === 'undefined') {
    fallbackToPlainTextarea('Quill 라이브러리가 로드되지 않음');
    return;
  }

  try {
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
    let lastPushedByQuill = null;

    function setQuillHtml(html) {
      syncingFromTextarea = true;
      quill.setText(''); // 기존 내용을 Quill의 정식 API로 비운 뒤
      if (html) {
        quill.clipboard.dangerouslyPasteHTML(0, html); // Quill 내부 모델까지 같이 갱신되는 정식 API로 삽입
      }
      syncingFromTextarea = false;
    }

    function pushQuillToTextarea() {
      if (syncingFromTextarea) return;
      // 내용이 비어있을 때 Quill이 남기는 빈 <p><br></p>는 저장하지 않고 빈 문자열로
      const html = quill.getText().trim() === '' ? '' : quill.root.innerHTML;
      lastPushedByQuill = html;
      textarea.value = html;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }

    quill.on('text-change', pushQuillToTextarea);

    // 기존 admin.js가 언제 textarea 값을 채우거나 바꾸는지 알 수 없어서, 계속 지켜보다가
    // "우리가 방금 쓴 값이 아닌" 변화가 감지되면 그때마다 Quill에 반영합니다. (한 번만 확인하고
    // 멈추면, 로딩 중간에 잠깐 있던 임시값을 최종값으로 착각해서 내용이 잘려 보일 수 있었습니다.)
    let lastSeenValue = textarea.value;
    if (lastSeenValue) setQuillHtml(lastSeenValue);
    setInterval(() => {
      const current = textarea.value;
      if (current !== lastSeenValue && current !== lastPushedByQuill) {
        lastSeenValue = current;
        setQuillHtml(current);
      } else {
        lastSeenValue = current;
      }
    }, 300);
  } catch (err) {
    fallbackToPlainTextarea(err.message);
  }
})();
