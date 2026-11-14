// ไคลเอนต์ Supabase ฝั่งเซิร์ฟเวอร์แบบเบา (PostgREST + Storage ผ่าน fetch) — ใช้ secret key เท่านั้น ห้ามส่งไปหน้าเว็บ/ห้ามขึ้น GitHub
const URL_ = String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''), KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'submissions';
exports.enabled = !!(URL_ && KEY);
const headers = extra => ({ apikey: KEY, ...(KEY.startsWith('eyJ') ? { Authorization: 'Bearer ' + KEY } : {}), ...extra }); // คีย์รุ่นใหม่ (sb_secret_) ใช้ apikey อย่างเดียว คีย์ JWT รุ่นเก่าต้องมี Authorization ด้วย
const call = (method, path, o = {}) => fetch(URL_ + path, { method, headers: headers({ ...(o.body !== undefined && !o.raw ? { 'Content-Type': 'application/json' } : {}), ...o.headers }), body: o.body === undefined ? undefined : o.raw ? o.body : JSON.stringify(o.body), signal: AbortSignal.timeout(o.ms || 10000) });
async function parse(r) {
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* ไม่ใช่ JSON */ }
  if (r.ok) return j;
  const msg = String((j && (j.message || j.error || j.msg)) || t.slice(0, 200) || r.status);
  throw Object.assign(new Error(msg), { status: r.status, code: /^DB_CONFLICT/.test(msg) ? 'DB_CONFLICT' : j && j.code === '23505' ? 'DB_UNIQUE' : 'SUPABASE_' + r.status });
}
exports.rest = async (method, pathQuery, o) => parse(await call(method, '/rest/v1/' + pathQuery, o));
exports.rpc = (fn, args) => exports.rest('POST', 'rpc/' + fn, { body: args });
exports.selectAll = async (table, query) => { // PostgREST คืนสูงสุด 1,000 แถวต่อครั้ง จึงอ่านเป็นหน้าๆ
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await call('GET', `/rest/v1/${table}?${query}`, { headers: { 'Range-Unit': 'items', Range: `${from}-${from + 999}` } });
    if (r.status === 416) break; // เกินช่วงข้อมูล = หมดแล้ว
    const rows = await parse(r); out.push(...rows); if (rows.length < 1000) break;
  }
  return out;
};
const enc = k => String(k).split('/').map(encodeURIComponent).join('/');
exports.storage = { // bucket แบบ private — เปิดได้เฉพาะผ่านเซิร์ฟเวอร์ของเรา
  async put(key, buf, type) { const r = await call('POST', `/storage/v1/object/${BUCKET}/${enc(key)}`, { body: buf, raw: true, headers: { 'Content-Type': type || 'application/octet-stream', 'x-upsert': 'false' }, ms: 30000 }); await parse(r); },
  async get(key) { const r = await call('GET', `/storage/v1/object/${BUCKET}/${enc(key)}`, { ms: 30000 }); if (!r.ok) throw Object.assign(new Error('storage ' + r.status), { status: r.status, code: 'STORAGE_' + r.status }); return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') }; },
  async del(key) { const r = await call('DELETE', `/storage/v1/object/${BUCKET}/${enc(key)}`); if (!r.ok && r.status !== 404) await parse(r); }
};
