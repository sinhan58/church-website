// 선교지 지도에서 국가를 선택하면 국기·대략적인 좌표가 자동으로 채워지도록 하는 공용 목록입니다.
// 홈페이지(main.js)와 관리자 페이지(admin.js) 양쪽에서 함께 사용합니다.
(function (global) {
  const COUNTRY_LIST = [
    { code: 'KR', name: '대한민국', lat: 36.5, lon: 127.8 },
    { code: 'JP', name: '일본', lat: 36.2, lon: 138.3 },
    { code: 'CN', name: '중국', lat: 35.9, lon: 104.2 },
    { code: 'MN', name: '몽골', lat: 46.9, lon: 103.8 },
    { code: 'TW', name: '대만', lat: 23.7, lon: 121.0 },
    { code: 'PH', name: '필리핀', lat: 12.9, lon: 121.8 },
    { code: 'VN', name: '베트남', lat: 14.1, lon: 108.3 },
    { code: 'KH', name: '캄보디아', lat: 12.6, lon: 105.0 },
    { code: 'LA', name: '라오스', lat: 19.9, lon: 102.5 },
    { code: 'TH', name: '태국', lat: 15.9, lon: 101.0 },
    { code: 'MM', name: '미얀마', lat: 21.9, lon: 96.0 },
    { code: 'ID', name: '인도네시아', lat: -0.8, lon: 113.9 },
    { code: 'MY', name: '말레이시아', lat: 4.2, lon: 108.0 },
    { code: 'IN', name: '인도', lat: 21.0, lon: 78.9 },
    { code: 'NP', name: '네팔', lat: 28.2, lon: 84.0 },
    { code: 'BD', name: '방글라데시', lat: 23.7, lon: 90.4 },
    { code: 'PK', name: '파키스탄', lat: 30.4, lon: 69.3 },
    { code: 'LK', name: '스리랑카', lat: 7.9, lon: 80.8 },
    { code: 'KZ', name: '카자흐스탄', lat: 48.0, lon: 66.9 },
    { code: 'UZ', name: '우즈베키스탄', lat: 41.4, lon: 64.6 },
    { code: 'KG', name: '키르기스스탄', lat: 41.2, lon: 74.8 },
    { code: 'TJ', name: '타지키스탄', lat: 38.9, lon: 71.3 },
    { code: 'TR', name: '튀르키예', lat: 38.9, lon: 35.2 },
    { code: 'IL', name: '이스라엘', lat: 31.0, lon: 34.9 },
    { code: 'JO', name: '요르단', lat: 30.6, lon: 36.2 },
    { code: 'ET', name: '에티오피아', lat: 9.1, lon: 40.5 },
    { code: 'KE', name: '케냐', lat: -0.0, lon: 37.9 },
    { code: 'UG', name: '우간다', lat: 1.4, lon: 32.3 },
    { code: 'TZ', name: '탄자니아', lat: -6.4, lon: 34.9 },
    { code: 'RW', name: '르완다', lat: -1.9, lon: 29.9 },
    { code: 'GH', name: '가나', lat: 7.9, lon: -1.0 },
    { code: 'NG', name: '나이지리아', lat: 9.1, lon: 8.7 },
    { code: 'ZA', name: '남아프리카공화국', lat: -30.6, lon: 22.9 },
    { code: 'EG', name: '이집트', lat: 26.8, lon: 30.8 },
    { code: 'MG', name: '마다가스카르', lat: -18.8, lon: 46.9 },
    { code: 'RU', name: '러시아', lat: 61.5, lon: 105.3 },
    { code: 'UA', name: '우크라이나', lat: 48.4, lon: 31.2 },
    { code: 'PL', name: '폴란드', lat: 51.9, lon: 19.1 },
    { code: 'DE', name: '독일', lat: 51.2, lon: 10.5 },
    { code: 'US', name: '미국', lat: 39.8, lon: -98.6 },
    { code: 'MX', name: '멕시코', lat: 23.6, lon: -102.6 },
    { code: 'GT', name: '과테말라', lat: 15.8, lon: -90.2 },
    { code: 'HN', name: '온두라스', lat: 15.2, lon: -86.2 },
    { code: 'HT', name: '아이티', lat: 18.9, lon: -72.3 },
    { code: 'DO', name: '도미니카공화국', lat: 18.7, lon: -70.2 },
    { code: 'PE', name: '페루', lat: -9.2, lon: -75.0 },
    { code: 'BO', name: '볼리비아', lat: -16.3, lon: -63.6 },
    { code: 'PY', name: '파라과이', lat: -23.4, lon: -58.4 },
    { code: 'BR', name: '브라질', lat: -14.2, lon: -51.9 },
    { code: 'AU', name: '호주', lat: -25.3, lon: 133.8 }
  ];

  // ISO 3166-1 alpha-2 코드를 국기 이모지로 변환 (예: 'KR' → 🇰🇷)
  function isoToFlag(code) {
    if (!code || code.length !== 2) return '';
    return code
      .toUpperCase()
      .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
  }

  function findCountry(code) {
    return COUNTRY_LIST.find((c) => c.code === code) || null;
  }

  global.COUNTRY_LIST = COUNTRY_LIST;
  global.isoToFlag = isoToFlag;
  global.findCountryByCode = findCountry;
})(window);
