/**
 * 관리자 비밀번호 해시 생성 스크립트
 * 사용법: node setup-admin.js 새비밀번호
 * 출력된 해시값을 .env 파일의 ADMIN_PASSWORD_HASH 에 넣으세요.
 */
const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.log('사용법: node setup-admin.js <새비밀번호>');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log('\n아래 값을 .env 파일의 ADMIN_PASSWORD_HASH 에 붙여넣으세요:\n');
console.log(hash);
console.log('');
