// 성경 리더 기능의 핵심 데이터 모듈입니다.
// - 본문 데이터는 이 파일과 같은 폴더의 bible-krv.json(대한성서공회 개역한글판, 1961 —
//   저작권 보호기간(50년) 만료로 공개도메인) 파일을 서버 시작 시 딱 한 번만 읽어서
//   메모리에 올려두고, 이후 요청마다 그 메모리 데이터에서 바로 꺼내 씁니다.
// - "오늘의 큐티"·"주일 설교"의 성경구절 표기(예: "요한복음 3장 16절", "사도행전 19장
//   1~7절")를 실제 책/장/절 좌표로 바꿔주는 parseVerseRef()도 여기서 함께 제공합니다.
//   (책 이름은 정식 이름 외에 흔히 쓰는 줄임말도 함께 인식합니다)

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'bible-krv.json');
const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

// book 번호(1~66) -> 책 정보(본문 포함) 매핑
const booksByNumber = new Map();
// 코드("GEN" 등) -> 책 정보
const booksByCode = new Map();
// 정식 이름("창세기" 등) -> 책 정보
const booksByName = new Map();

raw.books.forEach((b) => {
  booksByNumber.set(b.book, b);
  booksByCode.set(b.code, b);
  booksByName.set(b.name, b);
});

// 책 목록(본문 제외, 가벼운 버전) — 신/구약 선택 UI에서 사용
const booksIndex = raw.books.map((b) => ({
  book: b.book,
  code: b.code,
  name: b.name,
  testament: b.testament,
  chapters: b.chapters
}));

// 흔히 쓰는 줄임말/이표기 -> 정식 이름. 설교 제목·큐티 구절은 사람이 직접 타이핑하므로
// 정식 명칭이 아닌 줄임말이 섞여 들어올 수 있어, 넉넉하게 등록해둡니다.
const ALIASES = {
  창: '창세기', 출: '출애굽기', 레: '레위기', 민: '민수기', 신: '신명기',
  수: '여호수아', 삿: '사사기', 룻: '룻기',
  삼상: '사무엘상', 삼하: '사무엘하', 왕상: '열왕기상', 왕하: '열왕기하',
  대상: '역대상', 대하: '역대하', 스: '에스라', 느: '느헤미야', 에: '에스더',
  욥: '욥기', 시: '시편', 시편: '시편', 잠: '잠언', 전: '전도서',
  아: '아가', 아가서: '아가',
  사: '이사야', 렘: '예레미야', 애: '예레미야애가', 겔: '에스겔', 단: '다니엘',
  호: '호세아', 욜: '요엘', 암: '아모스', 옵: '오바댜', 욘: '요나', 미: '미가',
  나: '나훔', 합: '하박국', 습: '스바냐', 학: '학개', 슥: '스가랴', 말: '말라기',
  마: '마태복음', 막: '마가복음', 눅: '누가복음', 요: '요한복음', 행: '사도행전',
  롬: '로마서', 고전: '고린도전서', 고후: '고린도후서', 갈: '갈라디아서',
  엡: '에베소서', 빌: '빌립보서', 골: '골로새서',
  살전: '데살로니가전서', 살후: '데살로니가후서',
  딤전: '디모데전서', 딤후: '디모데후서', 딛: '디도서', 몬: '빌레몬서',
  히: '히브리서', 약: '야고보서', 벧전: '베드로전서', 벧후: '베드로후서',
  요일: '요한일서', 요이: '요한이서', 요삼: '요한삼서',
  '요한1서': '요한일서', '요한2서': '요한이서', '요한3서': '요한삼서',
  '요1서': '요한일서', '요2서': '요한이서', '요3서': '요한삼서',
  유: '유다서', 계: '요한계시록', 계시록: '요한계시록'
};

function resolveBookName(name) {
  if (booksByName.has(name)) return booksByName.get(name);
  if (ALIASES[name] && booksByName.has(ALIASES[name])) return booksByName.get(ALIASES[name]);
  return null;
}

// 인식 가능한 모든 책 이름(정식 명칭 + 줄임말, 예: "요한1서")을 한 번에 매칭하기 위한
// 정규식입니다. "요1서"처럼 이름 중간에 숫자가 낀 줄임말이 있어서, 단순히 "숫자가 나오면
// 거기까지가 책 이름"이라고 자르면 잘못 잘리기 때문에, 알고 있는 이름 목록으로 직접
// 매칭합니다. 긴 이름부터 시도해야 "요한일서"를 "요한"+나머지로 잘못 자르지 않습니다.
const ALL_BOOK_NAMES = [...booksByName.keys(), ...Object.keys(ALIASES)].sort((a, b) => b.length - a.length);
const BOOK_NAME_PATTERN = new RegExp('^(' + ALL_BOOK_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')');

// "요한복음 3장 16절" / "사도행전 19장 1~7절" / "요한복음 3:16" / "미가 2:3-5" /
// "고전 13장"(장 전체) 등 다양한 표기를 { book, code, name, chapter, verseStart, verseEnd }로 변환합니다.
// 인식하지 못하면 null을 돌려줍니다.
function parseVerseRef(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return null;

  const nameMatch = text.match(BOOK_NAME_PATTERN);
  if (!nameMatch) return null;
  const book = resolveBookName(nameMatch[1]);
  if (!book) return null;

  // 시편은 "장" 대신 "편"이라고 쓰는 경우가 많아서(예: "시편 23편 1절") 함께 인식합니다.
  const rest = text.slice(nameMatch[1].length);
  const m = rest.match(/^\s*(\d+)\s*(?:(?:장|편)\s*(\d+)?(?:\s*[~\-]\s*(\d+))?\s*절?|[:：]\s*(\d+)(?:\s*[~\-]\s*(\d+))?)?/);
  if (!m || !m[1]) return null;

  const [, chapterStr, v1a, v2a, v1b, v2b] = m;
  const chapter = parseInt(chapterStr, 10);
  if (!chapter || chapter < 1 || chapter > book.chapters) return null;

  const verseStart = v1a || v1b ? parseInt(v1a || v1b, 10) : null;
  const verseEnd = v2a || v2b ? parseInt(v2a || v2b, 10) : verseStart;

  return {
    book: book.book,
    code: book.code,
    name: book.name,
    testament: book.testament,
    chapter,
    verseStart: verseStart || null,
    verseEnd: verseEnd || null
  };
}

function getBooksIndex() {
  return booksIndex;
}

function getBookByCode(code) {
  const b = booksByCode.get(String(code || '').toUpperCase());
  if (!b) return null;
  return { book: b.book, code: b.code, name: b.name, testament: b.testament, chapters: b.chapters };
}

// 한 장의 본문을 [{verse, text}, ...] 배열로 돌려줍니다.
function getChapter(code, chapter) {
  const b = booksByCode.get(String(code || '').toUpperCase());
  if (!b) return null;
  const verses = b.verses[String(chapter)];
  if (!verses) return null;
  const verseNums = Object.keys(verses).map(Number).sort((a, c) => a - c);
  return {
    book: b.book,
    code: b.code,
    name: b.name,
    testament: b.testament,
    chapter: Number(chapter),
    chapterCount: b.chapters,
    verses: verseNums.map((v) => ({ verse: v, text: verses[String(v)] }))
  };
}

module.exports = {
  getBooksIndex,
  getBookByCode,
  getChapter,
  parseVerseRef,
  SOURCE_NOTICE: raw.source
};
