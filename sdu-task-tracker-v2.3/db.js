// ที่เก็บข้อมูล: Supabase Postgres (เมื่อมี SUPABASE_URL + SUPABASE_SECRET_KEY) หรือไฟล์ JSON ในเครื่อง (ไว้ลองรันเร็วๆ)
// โหมด Supabase: ตาราง public.app_records (collection, id, data jsonb, revision) — โหลดข้อมูลต่อคำขอ (แยก snapshot ด้วย AsyncLocalStorage)
//   แล้วบันทึกเฉพาะระเบียนที่เปลี่ยนกลับก่อนตอบ ผ่านฟังก์ชัน app_apply (ธุรกรรมเดียว ตรวจ revision กันเขียนทับกัน)
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { AsyncLocalStorage } = require('async_hooks');
const supa = require('./lib/supa'), REMOTE = supa.enabled, als = new AsyncLocalStorage();
const COLS = ['users', 'projects', 'tasks', 'notifications'];
const FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');
const empty = () => Object.fromEntries(COLS.map(c => [c, []]));
const newId = () => crypto.randomBytes(6).toString('hex');
const local = { data: empty(), dirty: false };
if (!REMOTE && fs.existsSync(FILE)) {
  try { local.data = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; }
  catch (e) { // ไฟล์เสีย: สำรองไว้ ห้ามเขียนทับจนข้อมูลหาย แล้วหยุดเริ่มระบบ
    const bak = FILE + '.corrupt-' + Date.now(); fs.copyFileSync(FILE, bak);
    console.error(JSON.stringify({ level: 'error', code: 'DB_CORRUPT', file: FILE, backup: bak, err: e.message }));
    throw new Error('ไฟล์ข้อมูลเสียหาย สำรองไว้ที่ ' + bak + ' — ตรวจสอบหรือลบไฟล์เดิมแล้วเริ่มใหม่');
  }
}
const S = () => (REMOTE && als.getStore()) || local;
const touch = (name, id) => { const s = S(); if (s.touched) (s.touched[name] || (s.touched[name] = new Set())).add(id); };
const save = () => {
  const s = S(); if (REMOTE) { s.dirty = true; return; }
  fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(s.data, null, 2)); fs.renameSync(FILE + '.tmp', FILE); // atomic
};
async function load() {
  const snap = { data: empty(), vers: Object.fromEntries(COLS.map(c => [c, new Map()])), touched: {}, dirty: false };
  const rows = await supa.selectAll('app_records', 'select=collection,id,data,revision&order=updated_at.asc,id.asc');
  rows.forEach(r => { if (!snap.data[r.collection]) return; snap.data[r.collection].push({ ...r.data, id: r.id }); snap.vers[r.collection].set(r.id, Number(r.revision)); });
  return snap;
}
async function flush(s) {
  if (!s.dirty) return;
  const ops = [];
  for (const c of COLS) for (const id of s.touched[c] || []) {
    const rec = s.data[c].find(x => x.id === id), exp = s.vers[c].get(id) || 0;
    if (rec) ops.push({ op: 'save', collection: c, id, data: rec, expected: exp });
    else if (s.vers[c].has(id)) ops.push({ op: 'delete', collection: c, id, expected: exp });
  }
  if (ops.length) await supa.rpc('app_apply', { p_changes: ops }); // ทั้งชุดสำเร็จหรือล้มเหลวพร้อมกัน
  ops.forEach(o => o.op === 'save' ? s.vers[o.collection].set(o.id, o.expected + 1) : s.vers[o.collection].delete(o.id));
  s.touched = {}; s.dirty = false;
}
const conflict = e => e.code === 'DB_CONFLICT' || e.code === 'DB_UNIQUE';
// middleware: ผูก snapshot ต่อคำขอ + บันทึกก่อนส่งคำตอบ (เฉพาะโหมด Supabase)
exports.context = (req, res, next) => {
  if (!REMOTE) return next();
  load().then(snap => {
    req.dbSnap = snap; const end = res.end;
    res.end = function (...a) {
      if (!snap.dirty) return end.apply(this, a);
      flush(snap).then(() => end.apply(this, a), err => {
        console.error(JSON.stringify({ level: conflict(err) ? 'warn' : 'error', code: err.code || 'DB_SAVE_FAILED', path: req.path, err: err.message }));
        this.statusCode = conflict(err) ? 409 : 500; this.setHeader('Content-Type', 'text/html; charset=utf-8');
        end.call(this, '<meta charset="utf-8"><p>' + (conflict(err) ? 'มีผู้ใช้อื่นแก้ไขข้อมูลเดียวกัน/ใช้ชื่อหรืออีเมลเดียวกันพร้อมกัน ยังไม่ได้บันทึก กรุณาทำรายการอีกครั้ง' : 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่') + '</p><a href="/">กลับหน้าแรก</a>');
      });
      return this;
    };
    als.run(snap, () => next());
  }).catch(e => { console.error(JSON.stringify({ level: 'error', code: 'DB_LOAD_FAILED', err: e.message })); next(e); });
};
// งานตั้งต้นที่ทำนอกคำขอ (เช่น สร้างบัญชี Admin) — ถ้ามีคนอื่นสร้างตัดหน้าไปแล้ว (ชนกัน) ถือว่าเรียบร้อย
exports.seed = async fn => {
  if (!REMOTE) return fn();
  const snap = await load(); await als.run(snap, () => fn());
  try { await flush(snap); } catch (e) { if (!conflict(e)) throw e; }
};
exports.keep = () => { const s = als.getStore(); return fn => s ? als.run(s, fn) : fn(); }; // เข้า context เดิมหลัง callback ของ stream (เช่น multer)
function collection(name) {
  const arr = () => { const d = S().data; return d[name] || (d[name] = []); };
  return {
    all: () => arr(), get: id => arr().find(x => x.id === id),
    add(o) { o.id = o.id || newId(); o.createdAt = new Date().toISOString(); arr().push(o); touch(name, o.id); save(); return o; },
    update(id, p) { const o = this.get(id); if (o) { Object.assign(o, p); touch(name, id); save(); } return o; },
    remove(id) { const d = S().data; d[name] = arr().filter(x => x.id !== id); touch(name, id); save(); }
  };
}
module.exports = Object.assign(exports, { collection, save, REMOTE, nextId: newId, flush });
