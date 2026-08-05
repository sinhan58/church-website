[CHANGES.md](https://github.com/user-attachments/files/30731605/CHANGES.md)
# 이번 작업(3차 수정)에서 변경/추가된 파일

| 이 폴더의 파일 | 실제 저장소 경로 | 상태 |
|---|---|---|
| `public/index.html` | `public/index.html` | 수정 |
| `public/prayer.html` | `public/prayer.html` | 수정 (2차 신규분, 이름 깜빡임만 추가 수정) |
| `public/inquiry.html` | `public/inquiry.html` | 수정 (2차 신규분, 이름 깜빡임만 추가 수정) |
| `public/receipt.html` | `public/receipt.html` | 수정 (마침표 제거 + 이름 깜빡임 수정) |
| `public/js/main.js` | `public/js/main.js` | 수정 |
| `public/js/secret-board.js` | `public/js/secret-board.js` | 2차 신규분 (이번엔 변경 없음) |
| `public/js/receipt.js` | `public/js/receipt.js` | 수정 |
| `public/js/font-catalog.js` | `public/js/font-catalog.js` | 수정 |
| `public/css/style.css` | `public/css/style.css` | 수정 |
| `routes/api.js` | `routes/api.js` | 2차 신규분 (이번엔 변경 없음) |
| `routes/admin.js` | `routes/admin.js` | 수정 (이미지 압축 로직 추가) |
| `public/admin/index.html` | `public/admin/index.html` | 2차 신규분 (이번엔 변경 없음) |
| `data/menu.json` | `data/menu.json` | 2차 신규분 (이번엔 변경 없음) |
| `data/prayers.json` | `data/prayers.json` | 신규 (1차분) |
| `data/inquiries.json` | `data/inquiries.json` | 신규 (2차분) |
| `package.json` | `package.json` | 수정 (sharp 의존성 추가) |

혼동을 줄이려고 이번엔 관련 없는 파일까지 폴더에 다 같이 담았습니다. 지금까지의 전체 변경사항이 다 들어있는
"완전판"이라고 보시면 됩니다 — 이 폴더 내용을 저장소에 그대로 덮어쓰시면 1차~3차 작업이 전부 한 번에 반영됩니다.

⚠️ **`public/admin/` 폴더는 여전히 `index.html` 파일 하나만 들어있습니다.** 그 폴더를 통째로 덮어쓰지 마시고
`public/admin/index.html` 파일 하나만 교체해주세요. (이유는 이전 안내와 동일 — 실제 대시보드 동작 스크립트인
`public/admin/js/admin.js`는 제가 받은 파일 목록에 없어서 손대지 않았습니다.)

---

## 이번에 새로 반영한 4가지

### 1. 교회 이름 깜빡임("교회" → "물댄동산교회") 해결
페이지가 열릴 때 잠깐 "교회"로 보였다가 이름이 채워지던 문제. 아래 파일들의 기본(placeholder) 텍스트를
전부 실제 이름으로 바꿔서, API 응답이 오기 전부터 이미 맞는 이름이 보이도록 했습니다.
- `public/index.html`, `public/js/main.js` (헤더 로고, 브라우저 탭 제목, 푸터)
- `public/prayer.html`, `public/inquiry.html` (헤더 로고, 푸터)
- `public/receipt.html`, `public/js/receipt.js` (헤더 로고, 푸터) — 겸사겸사 여기 남아있던 로고 옆 마침표(`.`)도 제거했습니다.

### 2. 골드 색상 명도 대비 개선 (접근성)
지난 조사에서 말씀드렸던 문제: 흰색/아이보리 배경 위의 금색 글자가 명도 대비 2.2~2.4:1로 낮아서
잘 안 보일 수 있다는 부분이었습니다.
- `public/css/style.css`에 밝은 배경 전용의 더 진한 금색(`--gold-deep`)을 새로 추가했습니다.
- 섹션 소제목(예: "OFFERING", "PRAYER REQUEST"), 게시판 카테고리 배지, 연락처 라벨, 큐티 하트 아이콘 등
  **밝은 배경 위에 있던 금색 글자들**을 이 색으로 바꿨습니다 (대비 약 4.5~4.9:1로 개선, 기준 통과).
- 예배안내처럼 원래 남색(어두운) 배경 위에 있던 금색은 원래도 대비가 좋아서 그대로 뒀습니다.

### 3. 구글 폰트 최적화
- `public/index.html`에서 무조건 불러오던 폰트 11종 중 기본 2종(노토 세리프/노토 산스)만 남기고 나머지
  8종은 뺐습니다.
- `public/js/font-catalog.js`에 `ensureGoogleFont()` 함수를 추가해서, 관리자가 다른 폰트(고운돋움,
  나눔고딕, 검은고딕 등)를 실제로 선택했을 때만 그 폰트 하나만 그때그때 불러오도록 바꿨습니다.
- `public/js/main.js`가 사이트 정보를 불러올 때 이 함수를 호출하도록 연결했습니다.
- 관리자 페이지는 폰트 미리보기가 필요해서 그대로 뒀습니다(방문자용 페이지만 최적화).

### 4. 이미지 자동 압축
- `routes/admin.js`의 이미지 업로드 로직에 `sharp` 라이브러리를 붙여서, 업로드되는 이미지를 서버에서
  자동으로 **가로 1920px 초과 시 축소 + 화질 82%로 재압축**하도록 했습니다.
- 움짤(GIF)이나 이미지가 아닌 첨부파일(주보 PDF 등)은 원본 그대로 두고, 압축 중 오류가 나도 업로드
  자체는 실패하지 않도록(원본으로 대체 저장) 안전장치를 넣었습니다.
- `package.json`에 `sharp`를 추가했습니다.

  ⚠️ **배포 시 꼭 필요한 작업**: 서버(Render 등)에 새 코드를 올린 뒤 **`npm install`을 다시 실행**해야
  `sharp` 라이브러리가 실제로 설치됩니다. Render처럼 `package.json`을 보고 자동으로 빌드하는 서비스라면
  보통 배포 시 자동으로 설치되지만, 혹시 빌드 로그에 sharp 관련 에러가 뜨면 알려주세요.

---

## 배포 전 체크리스트 (전체 누적)
1. 표에 따라 파일을 저장소 경로에 덮어쓰기 (`public/admin/`은 `index.html`만!)
2. `npm install` 재실행 (sharp 설치 확인)
3. 관리자 페이지 → '선교사역 섹션 타이틀', '지도 임베드 URL' 값 확인/수정 (1차 작업분)
4. 관리자 페이지 → '메뉴 관리'에서 "기도요청" 메뉴 링크가 `/prayer.html`로 되어 있는지 확인
5. 새 이미지를 하나 업로드해보고 실제로 용량이 줄어드는지 확인 (예: 5MB 사진 업로드 후 결과 용량 비교)
6. PC/모바일에서 골드 텍스트(섹션 제목, 배지 등)가 이전보다 또렷하게 보이는지 육안 확인
7. 새로고침 시 교회 이름이 더 이상 "교회"로 잠깐 보이지 않는지 확인
