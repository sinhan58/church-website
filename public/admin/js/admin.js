<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>관리자 페이지</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Serif+KR:wght@400;500;700&family=Gowun+Dodum&family=Gowun+Batang&family=Nanum+Gothic:wght@400;700;800&family=Nanum+Myeongjo:wght@400;700;800&family=Black+Han+Sans&family=Do+Hyeon&family=Song+Myung&family=Poor+Story&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css">
<link rel="stylesheet" href="/admin/css/admin.css" />
<link href="https://cdnjs.cloudflare.com/ajax/libs/quill/1.3.7/quill.snow.min.css" rel="stylesheet" />
</head>
<body>

<!-- 로그인 화면 -->
<div class="login-screen" id="login-screen">
  <form class="login-box" id="login-form" method="post" action="#">
    <h1>관리자 로그인</h1>
    <p class="login-sub">교회 홈페이지 관리자 페이지입니다</p>
    <label>아이디
      <input type="text" name="username" required autocomplete="username" />
    </label>
    <label>비밀번호
      <input type="password" name="password" required autocomplete="current-password" />
    </label>
    <p class="login-error" id="login-error"></p>
    <button type="submit" class="btn-primary">로그인</button>
  </form>
</div>

<div class="dashboard" id="dashboard" hidden>
  <aside class="sidebar">
    <div class="sidebar-brand">교회 관리자</div>
    <button class="sidebar-toggle-btn" id="sidebar-toggle-btn" type="button">
      <span>☰ 메뉴</span>
      <span id="sidebar-toggle-current"></span>
    </button>
    <nav class="sidebar-nav" id="sidebar-nav">
      <div class="nav-group">
        <div class="nav-group-title">콘텐츠 관리</div>
        <button class="nav-item active" data-panel="panel-site" data-permission="site">기본 정보</button>
        <button class="nav-item" data-panel="panel-menu" data-permission="menu">메뉴 관리</button>
        <button class="nav-item" data-panel="panel-sermons" data-permission="sermons">설교 영상(유튜브)</button>
        <button class="nav-item" data-panel="panel-praise">찬양</button>
        <button class="nav-item" data-panel="panel-qt" data-permission="qt">오늘의 큐티</button>
        <button class="nav-item" data-panel="panel-quiz" data-permission="qt">말씀 퀴즈</button>
        <button class="nav-item" data-panel="panel-missions" data-permission="missions">선교사역</button>
      </div>
      <div class="nav-group">
        <div class="nav-group-title">소통·게시판</div>
        <button class="nav-item" data-panel="panel-board" data-permission="posts">소식·친교 게시판</button>
        <button class="nav-item" data-panel="panel-prayers">기도 요청</button>
        <button class="nav-item" data-panel="panel-inquiries">온라인 문의</button>
      </div>
      <div class="nav-group">
        <div class="nav-group-title">운영 관리</div>
        <button class="nav-item" data-panel="panel-receipts" data-permission="receipts">영수증 신청</button>
        <button class="nav-item" data-panel="panel-stats" data-permission="stats">통계</button>
        <button class="nav-item" data-panel="panel-account">계정 관리</button>
      </div>
    </nav>
    <div class="sidebar-footer">
      <a href="/" target="_blank" class="view-site-link">홈페이지 보기 ↗</a>
      <button class="logout-btn" id="logout-btn">로그아웃</button>
    </div>
  </aside>

  <main class="content">

    <!-- 기본 정보 -->
    <section class="panel active" id="panel-site">
      <h2>기본 정보</h2>
      <p class="panel-desc">교회 이름, 대문(히어로) 문구, 교회 소개, 예배 시간, 연락처를 수정합니다.</p>

      <div class="card">
        <h3>교회 이름</h3>
        <div class="field"><label>교회 이름</label><input id="s-churchName" type="text" /></div>
      </div>

      <div class="card">
        <h3>글꼴 설정</h3>
        <p class="hint" style="margin-top:0;">교회 이름·제목 등에 쓰이는 글씨체와, 소개글·본문에 쓰이는 글씨체를 각각 선택할 수 있습니다.</p>
        <div class="field">
          <label>제목용 글씨체 (교회 이름, 각 섹션 제목 등)</label>
          <select id="s-headingFont"></select>
          <div class="font-preview" id="s-headingFont-preview">물댄동산교회 <span class="gold-dot">.</span></div>
        </div>
        <div class="field">
          <label>본문용 글씨체 (소개글, 안내 문구 등)</label>
          <select id="s-bodyFont"></select>
          <div class="font-preview" id="s-bodyFont-preview">언제나 문을 열어두고 여러분을 기다리고 있습니다.</div>
        </div>
      </div>

      <div class="card">
        <h3>대문 화면 (히어로)</h3>
        <div class="field"><label>대표 성경 말씀</label><textarea id="s-heroVerse" rows="2"></textarea></div>
        <div class="field"><label>말씀 출처 (예: 마태복음 11:28)</label><input id="s-heroVerseRef" type="text" /></div>
        <div class="field">
          <label>부제목</label>
          <textarea id="s-heroSubtitle" rows="2"></textarea>
          <p class="hint" style="margin-top:6px;">줄을 나누고 싶은 곳에서 Enter를 눌러 줄바꿈하면 화면에도 그대로 두 줄로 나옵니다.</p>
        </div>
        <div class="field">
  <label>배경 이미지 (여러 장 등록 가능)</label>
  <input type="file" id="s-heroImageFile" accept="image/*" />
  <div id="s-heroImageList" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;"></div>
  <p class="hint" style="margin-top:6px;">사진을 여러 장 올리시면 홈페이지 대문에서 6초마다 자연스럽게 다음 사진으로 넘어갑니다. 한 장만 올리면 예전처럼 고정된 사진으로 보여요.</p>
</div>
      </div>

      <div class="card">
        <h3>설교 영상 섹션</h3>
        <div class="field">
          <label>안내 문구 (섹션 제목 아래에 작게 나오는 설명)</label>
          <input id="s-sermonsIntro" type="text" placeholder="매주 유튜브 채널에 올라오는 설교 영상이 자동으로 갱신됩니다" />
        </div>
        <div class="field">
          <label>설교 카드용 목사님 사진 (선택)</label>
          <p class="hint" style="margin-top:0;">
            설교 영상 카드에 목사님 사진 + 자동 배경 + 설교 제목이 합성되어 노출됩니다. 기본 사진 3장이
            이미 들어가 있고, 여기서 사진을 추가로 올리시면 그것들과 함께 영상마다 자동으로 섞여서
            사용됩니다. (배경이 복잡한 사진을 올리시면 배경이 그대로 나옵니다 — 깔끔한 인물 사진일수록
            잘 어울려요)
          </p>
          <input type="file" id="s-sermonPhotoFile" accept="image/*" />
          <div id="s-sermonPhotoList" style="display:flex; flex-wrap:wrap; gap:10px; margin-top:10px;"></div>
        </div>
      </div>

      <div class="card">
        <h3>교회 소개</h3>
        <div class="field"><label>인사말 제목</label><input id="s-aboutGreeting" type="text" /></div>
        <div class="field"><label>소개 본문</label><textarea id="s-aboutBody" rows="4"></textarea></div>
        <div class="field"><label>연혁 한 줄</label><input id="s-aboutHistory" type="text" /></div>
        <div class="field"><label>담임목사 성함</label><input id="s-pastorName" type="text" /></div>
        <div class="field"><label>목회자 인사말</label><textarea id="s-pastorMessage" rows="3"></textarea></div>
        <div class="field">
          <label>교회 소개 이미지</label>
          <input type="file" id="s-aboutImageFile" accept="image/*" />
          <img class="preview" id="s-aboutImagePreview" />
        </div>
      </div>

      <div class="card">
        <h3>예배 시간</h3>
        <div id="service-list" class="list-editor"></div>
        <button class="btn-secondary" id="add-service-btn">+ 예배 시간 추가</button>
      </div>

      <div class="card">
        <h3>연락처 · 오시는 길</h3>
        <div class="field"><label>주소</label><input id="s-address" type="text" /></div>
        <div class="field"><label>추가 설명 (선택, 여러 줄 입력 가능)</label><textarea id="s-addressNote" rows="4" placeholder="예: 대동다숲 주상복합 3층
오색시장 정문에서 도보 3분"></textarea></div>
        <div class="field"><label>전화번호</label><input id="s-phone" type="text" /></div>
        <div class="field"><label>이메일</label><input id="s-email" type="text" /></div>
        <div class="field">
          <label>지도 임베드 URL (구글맵 등 &lt;iframe&gt; 방식 - 카카오맵을 아래에 설정하지 않았을 때 대신 쓰입니다)</label>
          <input id="s-mapUrl" type="text" placeholder="https://www.google.com/maps/embed?..." />
          <p class="hint" style="margin-top:6px;">
            구글맵(google.com/maps)에서 교회 주소 검색 → 공유 → '지도 퍼가기' → iframe 코드 안의 src="..." 주소만
            복사해서 붙여넣으면 됩니다. (카카오맵은 더 이상 이 방식의 코드를 제공하지 않아서, 카카오맵을 쓰시려면
            바로 아래 '카카오맵 연결' 항목을 이용해주세요.)
          </p>
        </div>
      </div>

      <div class="card">
        <h3>카카오맵 연결</h3>
        <p class="hint" style="margin-top:0;">
          1) map.kakao.com에서 교회 주소 검색 → 공유 아이콘 → 'HTML 태그 복사' 클릭<br />
          2) 뜨는 코드를 <strong>전체 다 선택해서(Ctrl+A) 복사</strong>(Ctrl+C)한 다음, 아래 칸에 그대로
          붙여넣기(Ctrl+V)만 해주세요. 어느 부분만 골라 복사할 필요 없이 통째로 붙여넣으면 됩니다.<br />
          3) 이 화면 맨 아래 '저장하기' 버튼을 누르면 자동으로 필요한 부분만 인식해서 반영됩니다.<br />
          4) 홈페이지에는 지도 미리보기 사진이 나오고, 방문자가 클릭하면 실제 카카오맵으로 이동해서
          확대·길찾기 등을 이용할 수 있습니다.
        </p>
        <div class="field">
          <label>카카오맵 코드 붙여넣기</label>
          <textarea id="s-kakaoMapCode" rows="6" placeholder="카카오맵에서 복사한 코드를 여기에 그대로 붙여넣으세요"></textarea>
          <p class="hint" id="kakao-map-status" style="margin-top:6px;"></p>
        </div>
      </div>

      <div class="card">
        <h3>헌금 안내</h3>
        <p class="hint">홈페이지 '헌금 안내' 섹션에 표시됩니다. 계좌번호는 공개되니 신중히 입력해주세요.</p>
        <div class="field-row">
          <div class="field"><label>은행명</label><input id="s-offeringBank" type="text" placeholder="OO은행" /></div>
          <div class="field"><label>계좌번호</label><input id="s-offeringAccount" type="text" placeholder="000-0000-0000" /></div>
        </div>
        <div class="field"><label>예금주</label><input id="s-offeringHolder" type="text" placeholder="물댄동산교회" /></div>
        <div class="field"><label>안내 문구 (헌금 종류 기재 방법 등)</label><textarea id="s-offeringNote" rows="4" placeholder="입금 시 '이름+헌금종류'를 남겨주세요. (예: 홍길동 십일조)"></textarea></div>
      </div>

      <div class="card">
        <h3>선교사역 섹션 타이틀</h3>
        <p class="hint" style="margin-top:0;">홈페이지 '선교사역' 섹션 상단 제목·부제입니다. 핀·동역자 항목은 좌측 '선교사역' 메뉴에서 관리합니다.</p>
        <div class="field"><label>제목</label><input id="s-missionsTitle" type="text" placeholder="물댄동산교회가 함께하는 선교지" /></div>
        <div class="field"><label>부제 (선택)</label><input id="s-missionsSubtitle" type="text" placeholder="함께 걷는 선교의 발걸음을 소개합니다" /></div>
      </div>

      <div class="card">
        <h3>SNS 링크</h3>
        <div class="field"><label>유튜브 채널 URL</label><input id="s-snsYoutube" type="text" /></div>
        <div class="field"><label>인스타그램 URL</label><input id="s-snsInstagram" type="text" /></div>
        <div class="field"><label>페이스북 URL</label><input id="s-snsFacebook" type="text" /></div>
        <div class="field"><label>네이버 밴드 URL</label><input id="s-snsBand" type="text" placeholder="https://www.band.us/band/1444664" /></div>
      </div>

      <button class="btn-primary" id="save-site-btn">기본 정보 저장</button>
      <span class="save-status" id="site-save-status"></span>
    </section>

    <!-- 메뉴 관리 -->
    <section class="panel" id="panel-menu">
      <h2>메뉴 관리</h2>
      <p class="panel-desc">상단 내비게이션에 표시될 메뉴를 추가, 수정, 삭제, 순서 변경할 수 있습니다.</p>
      <div class="card">
        <div id="menu-list" class="list-editor"></div>
        <div class="menu-add-row">
          <input type="text" id="new-menu-label" placeholder="메뉴 이름 (예: 새가족)" />
          <input type="text" id="new-menu-link" placeholder="연결 위치 (예: #about)" />
          <button class="btn-secondary" id="add-menu-btn">+ 메뉴 추가</button>
        </div>
      </div>
    </section>

    <!-- 게시판 관리 -->
    <section class="panel" id="panel-board">
      <h2>소식 · 친교 게시판</h2>
      <p class="panel-desc">교회 소식과 활동 게시글을 작성, 수정, 삭제합니다. 상단 고정도 가능합니다.</p>

      <div class="card">
        <h3 id="post-form-title">새 글 작성</h3>
        <div class="field-row">
          <div class="field"><label>구분</label>
            <select id="p-category"><option value="소식">소식</option><option value="활동">친교</option><option value="주보">주보</option></select>
          </div>
          <div class="field"><label>날짜</label><input id="p-date" type="date" /></div>
        </div>
        <div class="field"><label>제목</label><input id="p-title" type="text" /></div>
        <div class="field">
          <label>내용</label>
          <div id="p-content-toolbar">
            <span class="ql-formats">
              <select class="ql-size"><option value="small"></option><option selected></option><option value="large"></option><option value="huge"></option></select>
            </span>
            <span class="ql-formats">
              <button class="ql-bold"></button>
              <button class="ql-italic"></button>
              <button class="ql-underline"></button>
            </span>
            <span class="ql-formats">
              <select class="ql-color"></select>
            </span>
            <span class="ql-formats">
              <button class="ql-list" value="ordered"></button>
              <button class="ql-list" value="bullet"></button>
            </span>
            <span class="ql-formats">
              <button class="ql-align" value=""></button>
              <button class="ql-align" value="center"></button>
            </span>
            <span class="ql-formats">
              <button class="ql-clean"></button>
            </span>
          </div>
          <div id="p-content-editor"></div>
        </div>
        <div class="field">
          <label>첨부 이미지 (선택, 본문 상단에 표시됨)</label>
          <input type="file" id="p-imageFile" accept="image/*" />
          <img class="preview" id="p-imagePreview" />
        </div>
        <div class="field">
          <label>첨부파일 (선택, 문서·PDF·한글파일 등, 최대 5개)</label>
          <input type="file" id="p-attachmentFiles" multiple />
          <div id="p-attachmentList" class="attachment-edit-list"></div>
        </div>
        <div class="field-checkbox"><label><input type="checkbox" id="p-pinned" /> 상단 고정</label></div>
        <div class="post-form-actions">
          <button class="btn-primary" id="add-post-btn">게시글 등록</button>
          <button class="btn-secondary" id="cancel-edit-btn" hidden>취소</button>
        </div>
      </div>

      <div class="card">
        <h3>게시글 목록</h3>
        <div id="post-list" class="post-list"></div>
      </div>
    </section>

    <!-- 기도 요청 -->
    <section class="panel" id="panel-prayers">
      <h2>기도 요청</h2>
      <p class="panel-desc">
        홈페이지 '기도 요청'에 성도님들이 남긴 내용입니다. 비밀글로 등록된 항목도
        목회자 확인을 위해 이 화면에서는 내용이 그대로 보입니다(다른 방문자에게는 비공개).
      </p>
      <div class="card">
        <button class="btn-secondary" id="prayers-refresh-btn" type="button">새로고침</button>
        <div id="prayers-admin-list" class="post-list" style="margin-top:14px;"></div>
      </div>
    </section>

    <!-- 온라인 문의 -->
    <section class="panel" id="panel-inquiries">
      <h2>온라인 문의</h2>
      <p class="panel-desc">
        홈페이지 '오시는 길 &gt; 온라인 문의하기'로 접수된 내용입니다. 비밀글로 등록된 항목도
        이 화면에서는 내용이 그대로 보입니다(다른 방문자에게는 비공개).
      </p>
      <div class="card">
        <button class="btn-secondary" id="inquiries-refresh-btn" type="button">새로고침</button>
        <div id="inquiries-admin-list" class="post-list" style="margin-top:14px;"></div>
      </div>
    </section>

    <!-- 오늘의 큐티 -->
    <section class="panel" id="panel-qt">
      <h2>오늘의 큐티</h2>
      <p class="panel-desc">매일 아침 카카오톡으로 보내시는 큐티 내용을 그대로 붙여넣으면 홈페이지에 자동으로 게시됩니다.</p>

      <div class="card">
        <h3>배경 디자인</h3>
        <p class="hint">홈 화면 '오늘의 큐티' 카드 뒤쪽 배경을 골라주세요.</p>
        <div class="field">
          <label>배경 유형</label>
          <select id="qt-bg-type">
            <option value="preset">프리셋</option>
            <option value="photo">사진 업로드</option>
          </select>
        </div>
        <div class="field" id="qt-bg-preset-field">
          <label>프리셋</label>
          <select id="qt-bg-preset">
            <option value="navy">딥네이비 (기본)</option>
            <option value="gold">골드 글로우</option>
            <option value="dawn">새벽빛</option>
          </select>
        </div>
        <div class="field" id="qt-bg-photo-field" hidden>
          <label>배경 사진</label>
          <input type="file" id="qt-bg-photoFile" accept="image/*" />
          <img class="preview" id="qt-bg-photoPreview" />
        </div>
        <button class="btn-primary" id="save-qt-bg-btn">배경 저장</button>
        <span class="save-status" id="qt-bg-save-status"></span>
      </div>

      <div class="card">
        <h3 id="qt-form-title">새 큐티 작성</h3>
        <div class="field">
          <label>카톡 붙여넣기로 자동 채우기</label>
          <p class="hint">카카오톡으로 받은 큐티 원문 전체를 아래에 붙여넣고 "자동 채우기"를 누르면 아래 입력칸이 채워집니다. 채워진 내용은 저장 전에 직접 확인·수정할 수 있습니다.</p>
          <textarea id="qt-paste" rows="10" placeholder="카카오톡 큐티 원문 전체를 여기에 붙여넣으세요."></textarea>
          <div class="post-form-actions">
            <button type="button" class="btn-secondary" id="qt-parse-btn">자동 채우기</button>
          </div>
          <span class="hint" id="qt-parse-status"></span>
        </div>
        <div class="field-row">
          <div class="field"><label>날짜</label><input id="qt-date" type="date" /></div>
          <div class="field"><label>목사님 성함</label><input id="qt-pastor" type="text" placeholder="이기삼 목사" /></div>
        </div>
        <div class="field"><label>제목</label><input id="qt-title" type="text" placeholder="나의 도움이 어디서 올까" /></div>
        <div class="field"><label>말씀 구절 위치</label><input id="qt-verseRef" type="text" placeholder="시편 121편 1-2절" /></div>
        <div class="field"><label>말씀 본문</label><textarea id="qt-verseText" rows="3" placeholder="내가 산을 향하여 눈을 들리라..."></textarea></div>
        <div class="field"><label>묵상 나눔</label><textarea id="qt-body" rows="6" placeholder="오늘 말씀은..."></textarea></div>
        <div class="post-form-actions">
          <button class="btn-primary" id="add-qt-btn">큐티 등록</button>
          <button class="btn-secondary" id="cancel-qt-edit-btn" hidden>취소</button>
        </div>
        <span class="save-status" id="qt-save-status"></span>
      </div>

      <div class="card">
        <h3>큐티 목록</h3>
        <div id="qt-list" class="post-list"></div>
      </div>
    </section>

    <!-- 말씀 퀴즈 -->
    <section class="panel" id="panel-quiz">
      <h2>말씀 퀴즈</h2>
      <p class="panel-desc">
        매주 성경 본문을 붙여넣으면 빈칸 채우기 퀴즈로 자동 변환됩니다. 빈칸으로 만들 단어는
        괄호로 감싸주세요. 예: <code>그러므로 여호와의 (말씀)에 내가 이 족속에게 (재앙)을 계획하나니</code>
      </p>

      <div class="card">
        <h3 id="quiz-form-title">새 퀴즈 등록</h3>
        <div class="field">
          <label>본문 출처 (예: 미가 2:3-5)</label>
          <input type="text" id="quiz-reference-input" placeholder="미가 2:3-5" />
        </div>
        <div class="field">
          <label>주차 표시 (선택, 비워두면 오늘 날짜로 자동 표시)</label>
          <input type="text" id="quiz-week-input" placeholder="예: 2026년 8월 3주" />
        </div>
        <div class="field">
          <label>본문 붙여넣기 (한 줄에 절 번호 + 내용, 빈칸은 괄호로)</label>
          <textarea id="quiz-paste-input" rows="8" placeholder="3 그러므로 여호와의 (말씀)에 내가 이 족속에게 (재앙)을 계획하나니 너희의 목이 이에서 벗어나지 못할 것이요 또한 (교만)하게 다니지 못할 것이라 이는 재앙의 때임이라 하셨느니라
4 그 때에 너희를 조롱하는 (시)를 지으며 슬픈 (노래)를 불러 이르기를..."></textarea>
        </div>
        <button type="button" class="btn-secondary" id="quiz-preview-btn">미리보기</button>
        <div id="quiz-preview-box" style="display:none; margin-top:14px; padding:16px; background:#fafbfc; border:1px solid var(--line); border-radius:6px;"></div>
        <div style="margin-top:16px;">
          <button type="button" class="btn-primary" id="quiz-register-btn" style="width:auto; padding:11px 22px;">이번 주 퀴즈로 등록</button>
          <button type="button" class="btn-secondary" id="quiz-cancel-edit-btn" hidden>취소</button>
          <span class="save-status" id="quiz-save-status"></span>
        </div>
      </div>

      <div class="card">
        <h3>등록된 퀴즈 목록</h3>
        <button class="btn-secondary" id="quiz-list-refresh-btn" type="button">새로고침</button>
        <div id="quiz-admin-list" class="post-list" style="margin-top:14px;"></div>
      </div>

      <div class="card">
        <h3>참여 통계</h3>
        <div class="field">
          <label>퀴즈 선택</label>
          <select id="quiz-stats-select"><option value="">등록된 퀴즈가 없습니다</option></select>
        </div>
        <div id="quiz-stats-summary"></div>
        <div id="quiz-stats-list" style="margin-top:16px;"></div>
      </div>
    </section>

    <!-- 찬양 -->
    <section class="panel" id="panel-praise">
      <h2>찬양</h2>
      <p class="panel-desc">함께 듣고 싶은 찬양 유튜브 영상을 등록해두면, 홈페이지 '찬양' 섹션에 목록으로 노출됩니다.</p>

      <div class="card">
        <h3 id="praise-form-title">새 찬양 등록</h3>
        <div class="field"><label>제목</label><input id="praise-title" type="text" placeholder="주 은혜임을" /></div>
        <div class="field"><label>부른이 (선택)</label><input id="praise-singer" type="text" placeholder="어노인팅" /></div>
        <div class="field">
          <label>유튜브 주소</label>
          <input id="praise-youtubeUrl" type="text" placeholder="https://www.youtube.com/watch?v=..." />
          <p class="hint" style="margin-top:6px;">유튜브에서 영상 공유 → 링크 복사한 걸 그대로 붙여넣으면 됩니다.</p>
        </div>
        <div class="post-form-actions">
          <button class="btn-primary" id="add-praise-btn">찬양 등록</button>
          <button class="btn-secondary" id="cancel-praise-edit-btn" hidden>취소</button>
        </div>
        <span class="save-status" id="praise-save-status"></span>
      </div>

      <div class="card">
        <h3>찬양 목록</h3>
        <div id="praise-list" class="post-list"></div>
      </div>
    </section>

    <!-- 선교사역 -->
    <section class="panel" id="panel-missions">
      <h2>선교사역</h2>
      <p class="panel-desc">세계지도에 표시할 선교지 핀과, 교회를 후원해주시는 동역자(기관·개인) 정보를 관리합니다. 섹션 제목은 '기본 정보' 메뉴에서 수정합니다.</p>

      <div class="card">
        <h3 id="mission-form-title">선교지 추가</h3>
        <div class="field-row">
          <div class="field">
            <label>국가</label>
            <select id="m-countryCode"></select>
          </div>
          <div class="field"><label>배지 문구 (선택, 비우면 국가명이 표시됨)</label><input id="m-tag" type="text" placeholder="예: 송아지 · 장학" /></div>
        </div>
        <div class="field"><label>선교사님 성함</label><input id="m-name" type="text" placeholder="홍길동 선교사" /></div>
        <div class="field"><label>사역 세부 내용 (여러 줄 입력 가능)</label><textarea id="m-desc" rows="3" placeholder="현지에서 어떤 사역을 하고 계신지 소개해주세요."></textarea></div>
        <div class="field">
          <label>사진 (선택)</label>
          <input type="file" id="m-imageFile" accept="image/*" />
          <img class="preview" id="m-imagePreview" />
        </div>
        <div class="post-form-actions">
          <button class="btn-primary" id="add-mission-btn">선교지 등록</button>
          <button class="btn-secondary" id="cancel-mission-edit-btn" hidden>취소</button>
        </div>
        <span class="save-status" id="mission-save-status"></span>
      </div>

      <div class="card">
        <h3>선교지 목록</h3>
        <div id="mission-list" class="post-list"></div>
      </div>

      <div class="card">
        <h3 id="partner-form-title">동역자 추가</h3>
        <div class="field-row">
          <div class="field"><label>이름 / 기관명</label><input id="pt-name" type="text" placeholder="한마음선교회 또는 홍길동 집사" /></div>
          <div class="field"><label>동역 시작일</label><input id="pt-startDate" type="date" /></div>
        </div>
        <div class="field"><label>소개 문구 (선택)</label><input id="pt-note" type="text" placeholder="꾸준히 함께해주고 계신 동역자입니다" /></div>
        <div class="field">
          <label>사진 (선택)</label>
          <input type="file" id="pt-imageFile" accept="image/*" />
          <img class="preview" id="pt-imagePreview" />
        </div>
        <div class="post-form-actions">
          <button class="btn-primary" id="add-partner-btn">동역자 등록</button>
          <button class="btn-secondary" id="cancel-partner-edit-btn" hidden>취소</button>
        </div>
        <span class="save-status" id="partner-save-status"></span>
      </div>

      <div class="card">
        <h3>동역자 목록</h3>
        <p class="hint" style="margin-top:0;">홈페이지에는 이 순서대로 표시되며, D-day는 동역 시작일 기준으로 매일 자동 계산됩니다.</p>
        <div id="partner-list" class="post-list"></div>
      </div>
    </section>

    <!-- 통계 -->
    <section class="panel" id="panel-stats">
      <h2>통계</h2>
      <p class="panel-desc">홈페이지 방문 수와 콘텐츠별 클릭 현황을 확인할 수 있습니다.</p>

      <div class="card">
        <h3>방문 수</h3>
        <div class="stats-cards" id="stats-summary-cards"></div>
      </div>

      <div class="card">
        <h3>인기 콘텐츠 클릭 (최근 7일)</h3>
        <div id="stats-click-list" class="stats-bar-list"></div>
      </div>

      <div class="card">
        <h3>페이지별 조회수 (최근 7일)</h3>
        <div id="stats-page-list" class="stats-bar-list"></div>
      </div>
    </section>

    <!-- 기부금 영수증 신청 -->
    <section class="panel" id="panel-receipts">
      <h2>기부금 영수증 신청</h2>
      <p class="panel-desc">홈페이지 '헌금 안내'에서 성도님들이 신청한 내역입니다. 확인 후 개별 연락하시고, 처리가 끝나면 목록에서 삭제해주세요.</p>
      <div class="card">
        <div id="receipt-list" class="post-list"></div>
      </div>
    </section>

    <!-- 설교 영상 (유튜브) -->
    <section class="panel" id="panel-sermons">
      <h2>설교 영상 (유튜브 자동 업데이트)</h2>
      <p class="panel-desc">
        교회 유튜브 채널ID를 서버 환경변수(YOUTUBE_CHANNEL_ID)에 등록하면,
        매일 지정된 시간에 자동으로 최신 설교 영상을 가져옵니다.
        아래 버튼으로 지금 바로 새로고침할 수도 있습니다.
      </p>
      <div class="card">
        <h3>수동 새로고침</h3>
        <div class="field"><label>유튜브 채널ID (비워두면 서버 기본값 사용)</label><input id="yt-channelId" type="text" placeholder="UCxxxxxxxxxxxxxxxxxxxxxx" /></div>
        <button class="btn-primary" id="refresh-sermons-btn">지금 새로고침</button>
        <span class="save-status" id="sermon-refresh-status"></span>
        <p class="hint">※ 채널ID는 유튜브 채널의 '정보' 페이지에서 확인할 수 있습니다 (UC로 시작하는 문자열).</p>
      </div>
      <div class="card">
        <h3>설교 카드 이미지 다시 만들기</h3>
        <p class="hint" style="margin-top:0;">
          설교 카드(목사님 사진+제목이 합성된 이미지)는 한 번 만들면 저장해뒀다가 재사용합니다.
          디자인을 바꿨거나, 예전에 이상하게 만들어진 카드가 있다면 아래 버튼으로 전부 지우고
          새로 만들게 할 수 있습니다. (다음에 홈페이지를 열 때 자동으로 다시 생성됩니다)
        </p>
        <button class="btn-secondary" id="clear-sermon-posters-btn">모든 설교 카드 이미지 다시 만들기</button>
        <span class="save-status" id="sermon-posters-clear-status"></span>
      </div>
      <div class="card">
        <h3>현재 캐시된 영상 목록</h3>
        <p id="sermon-last-updated" class="hint"></p>
        <div id="sermon-preview-list" class="sermon-preview-list"></div>
      </div>
    </section>

    <!-- 계정 관리 -->
    <section class="panel" id="panel-account">
      <h2>계정 관리</h2>
      <p class="panel-desc">내 비밀번호를 변경하거나, 메인 관리자인 경우 부관리자 계정과 권한을 관리할 수 있습니다.</p>

      <div class="card">
        <h3>내 비밀번호 변경</h3>
        <div class="field"><label>현재 비밀번호</label><input id="pw-current" type="password" autocomplete="current-password" /></div>
        <div class="field"><label>새 비밀번호 (6자 이상)</label><input id="pw-new" type="password" autocomplete="new-password" /></div>
        <div class="field"><label>새 비밀번호 확인</label><input id="pw-confirm" type="password" autocomplete="new-password" /></div>
        <button class="btn-primary" id="save-password-btn">비밀번호 변경</button>
        <span class="save-status" id="password-save-status"></span>
      </div>

      <div class="card" id="account-add-card" hidden>
        <h3>부관리자 계정 추가</h3>
        <div class="field-row">
          <div class="field"><label>아이디</label><input id="acc-username" type="text" autocomplete="off" /></div>
          <div class="field"><label>비밀번호 (6자 이상)</label><input id="acc-password" type="password" autocomplete="new-password" /></div>
        </div>
        <div class="field">
          <label>권한 범위</label>
          <div class="permission-checks">
            <label><input type="checkbox" id="acc-perm-site" /> 기본 정보</label>
            <label><input type="checkbox" id="acc-perm-menu" /> 메뉴 관리</label>
            <label><input type="checkbox" id="acc-perm-posts" /> 소식·친교 게시판</label>
            <label><input type="checkbox" id="acc-perm-sermons" /> 설교 영상</label>
            <label><input type="checkbox" id="acc-perm-qt" /> 오늘의 큐티</label>
            <label><input type="checkbox" id="acc-perm-missions" /> 선교사역</label>
            <label><input type="checkbox" id="acc-perm-stats" /> 통계</label>
            <label><input type="checkbox" id="acc-perm-receipts" /> 영수증 신청</label>
          </div>
        </div>
        <button class="btn-primary" id="add-account-btn">계정 추가</button>
        <span class="save-status" id="account-add-status"></span>
      </div>

      <div class="card" id="account-list-card" hidden>
        <h3>전체 관리자 계정</h3>
        <div id="account-list" class="account-list"></div>
      </div>
    </section>

  </main>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/quill/1.3.7/quill.min.js"></script>
<script src="/js/font-catalog.js"></script>
<script src="/js/countries.js"></script>
<script src="/admin/js/admin.js?v=9"></script>

</body>
</html>
