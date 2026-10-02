const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'church-uploads';

// SUPABASE_URL / SUPABASE_KEY가 설정되어 있으면 Supabase를 사용하고,
// 없으면 기존처럼 로컬 JSON 파일을 사용합니다 (로컬 개발 시 그대로 동작).
const useSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);

let supabase = null;
let storageClient = null; // 이미지/첨부파일 업로드 전용 클라이언트 (service key가 있으면 그걸 사용)

if (useSupabase) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  // 이미지 업로드는 storage.objects 테이블의 RLS 정책 때문에 anon key로는 막히는 경우가 많아,
  // SUPABASE_SERVICE_KEY(service_role 키)가 있으면 그것으로 별도 클라이언트를 만들어 업로드에 사용합니다.
  // (service_role 키는 서버에서만 쓰고 절대 브라우저/클라이언트 코드에 노출하면 안 됩니다.)
  if (process.env.SUPABASE_SERVICE_KEY) {
    storageClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  } else {
    storageClient = supabase;
  }

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

// 이미지/첨부파일을 저장합니다.
// - Supabase 연결 시: Supabase Storage 버킷에 업로드하고 공개 URL을 반환 (재시작/재배포에도 보존됨)
// - 미연결 시: 기존처럼 서버 로컬 디스크(public/uploads)에 저장 (재배포 시 사라질 수 있음)
async function saveUploadedFile(buffer, filename, mimetype, localUploadsDir) {
  if (useSupabase) {
    const { error } = await storageClient.storage
      .from(STORAGE_BUCKET)
      .upload(filename, buffer, { contentType: mimetype, upsert: true });

    if (error) {
      console.error('❌ Supabase Storage 업로드 실패:', error.message);
      throw new Error(
        `이미지 업로드 실패: ${error.message} ` +
        `(Supabase 대시보드 > Storage에서 '${STORAGE_BUCKET}' 버킷이 Public으로 생성되어 있는지, ` +
        `SUPABASE_SERVICE_KEY가 설정되어 있는지 확인해주세요.)`
      );
    }

    const { data } = storageClient.storage.from(STORAGE_BUCKET).getPublicUrl(filename);
    return data.publicUrl;
  }

  // 로컬 디스크 저장 (Supabase 미연결 시 대체 동작)
  fs.writeFileSync(path.join(localUploadsDir, filename), buffer);
  return `/uploads/${filename}`;
}

// "읽고 → 고치고 → 저장"을 한 데이터 덩어리(name)마다 한 번에 하나씩 차례대로 처리합니다.
// 두 사람이 거의 동시에 아멘을 누르는 경우처럼, 동시에 읽고 저장하면 한쪽 변경이 덮어써져
// 사라지는 문제를 막기 위한 것입니다. (서버가 한 대라서 서버 안에서 순서만 지키면 충분합니다)
// 사용법: await updateData('qt', (list) => { ...list 수정...; return list; })
const updateLocks = new Map();
function updateData(name, mutator) {
  const prev = updateLocks.get(name) || Promise.resolve();
  const run = prev.catch(() => {}).then(async () => {
    const current = await readData(name);
    const next = await mutator(current);
    if (next !== undefined) await writeData(name, next);
    return next;
  });
  // 다음 작업은 이번 작업이 끝난 뒤(성공/실패 상관없이) 시작
  updateLocks.set(name, run.catch(() => {}));
  return run;
}

// 전체 데이터 백업용: 저장된 모든 데이터 덩어리를 { 이름: 내용 } 형태로 한 번에 읽습니다.
async function readAllData() {
  if (!useSupabase) {
    const out = {};
    if (fs.existsSync(DATA_DIR)) {
      fs.readdirSync(DATA_DIR)
        .filter((f) => f.endsWith('.json'))
        .forEach((f) => { out[f.replace(/\.json$/, '')] = readFileData(f.replace(/\.json$/, '')); });
    }
    return out;
  }
  const out = {};
  const PAGE = 500;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('site_data')
      .select('key, value')
      .order('key')
      .range(from, from + PAGE - 1);
    if (error) throw new Error('Supabase 전체 읽기 실패: ' + error.message);
    (data || []).forEach((row) => { out[row.key] = row.value; });
    if (!data || data.length < PAGE) break;
  }
  return out;
}

module.exports = { readData, writeData, updateData, readAllData, makeId, saveUploadedFile, useSupabase, STORAGE_BUCKET };
