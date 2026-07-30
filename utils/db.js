const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// SUPABASE_URL / SUPABASE_KEY가 설정되어 있으면 Supabase를 사용하고,
// 없으면 기존처럼 로컬 JSON 파일을 사용합니다 (로컬 개발 시 그대로 동작).
const useSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);

let supabase = null;
if (useSupabase) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  console.log('✅ Supabase 연결 모드로 실행합니다 (데이터가 서버 재시작에도 보존됩니다).');
} else {
  console.warn('⚠️  SUPABASE_URL/SUPABASE_KEY가 없어 로컬 파일(data/*.json) 모드로 실행합니다. 재배포 시 데이터가 초기화될 수 있습니다.');
}

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readFileData(name) {
  const p = filePath(name);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf-8');
  return JSON.parse(raw);
}

function writeFileData(name, data) {
  const p = filePath(name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

// site / menu / posts / sermons 같은 이름(key)으로 데이터 덩어리를 읽습니다.
async function readData(name) {
  if (!useSupabase) return readFileData(name);

  const { data, error } = await supabase
    .from('site_data')
    .select('value')
    .eq('key', name)
    .maybeSingle();

  if (error) {
    console.error(`❌ Supabase 읽기 실패 (${name}):`, error.message);
    return null;
  }
  return data ? data.value : null;
}

// 데이터 덩어리를 통째로 저장(덮어쓰기)합니다.
async function writeData(name, data) {
  if (!useSupabase) return writeFileData(name, data);

  const { error } = await supabase
    .from('site_data')
    .upsert({ key: name, value: data, updated_at: new Date().toISOString() });

  if (error) {
    console.error(`❌ Supabase 쓰기 실패 (${name}):`, error.message);
    throw new Error(`데이터 저장 실패: ${error.message}`);
  }
  return data;
}

// 간단한 고유 ID 생성기
function makeId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = { readData, writeData, makeId };
