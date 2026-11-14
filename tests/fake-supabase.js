// เซิร์ฟเวอร์ Supabase จำลองในหน่วยความจำ (PostgREST + RPC app_apply + Storage) สำหรับทดสอบโดยไม่ต้องต่อเน็ต
const BASE = 'https://fake.supabase.co';
const state = { records: new Map(), sessions: new Map(), objects: new Map(), calls: [], seq: 0 };
const key = (c, id) => c + '/' + id;
const json = (status, body) => ({ ok: status < 400, status, text: async () => body === undefined ? '' : JSON.stringify(body), headers: new Map([['content-type', 'application/json']]) });
function apply(ops) { // เหมือนฟังก์ชัน public.app_apply: ธุรกรรมเดียว ตรวจ revision และ unique ของบัญชี
  const snap = new Map([...state.records].map(([k, v]) => [k, { ...v }]));
  try {
    for (const op of ops) {
      const k = key(op.collection, op.id), cur = state.records.get(k);
      if (op.op === 'save') {
        if (cur && cur.revision !== Number(op.expected)) throw Object.assign(new Error('DB_CONFLICT:' + op.collection + ':' + op.id), { status: 400, code: 'P0001' });
        if (!cur && Number(op.expected) !== 0) throw Object.assign(new Error('DB_CONFLICT:' + op.collection + ':' + op.id), { status: 400, code: 'P0001' });
        if (op.collection === 'users') for (const [k2, r] of state.records) if (r.collection === 'users' && r.id !== op.id && (String(r.data.username).toLowerCase() === String(op.data.username).toLowerCase() || String(r.data.email).toLowerCase() === String(op.data.email).toLowerCase())) throw Object.assign(new Error('duplicate key value violates unique constraint'), { status: 409, code: '23505' });
        state.records.set(k, { collection: op.collection, id: op.id, data: JSON.parse(JSON.stringify(op.data)), revision: cur ? cur.revision + 1 : 1, updated_at: ++state.seq });
      } else if (op.op === 'delete') {
        if (!cur || cur.revision !== Number(op.expected)) throw Object.assign(new Error('DB_CONFLICT:' + op.collection + ':' + op.id), { status: 400, code: 'P0001' });
        state.records.delete(k);
      }
    }
  } catch (e) { state.records = snap; throw e; }
}
global.fetch = async (url, o = {}) => {
  const u = new URL(url), p = u.pathname, h = o.headers || {}, method = o.method || 'GET';
  state.calls.push({ method, path: p + u.search, headers: h });
  if (!url.startsWith(BASE)) throw new Error('unexpected host ' + url);
  if (!h.apikey) return json(401, { message: 'No API key' });
  if (p === '/rest/v1/app_records' && method === 'GET') {
    const rows = [...state.records.values()].sort((a, b) => a.updated_at - b.updated_at || a.id.localeCompare(b.id));
    const [from, to] = String(h.Range || '0-999').split('-').map(Number);
    if (from > 0 && from >= rows.length) return json(416, { message: 'Requested range not satisfiable' });
    return json(200, rows.slice(from, to + 1).map(r => ({ collection: r.collection, id: r.id, data: r.data, revision: r.revision })));
  }
  if (p === '/rest/v1/rpc/app_apply' && method === 'POST') {
    try { apply(JSON.parse(o.body).p_changes); return json(200, null); } catch (e) { return json(e.status || 500, { code: e.code, message: e.message }); }
  }
  if (p === '/rest/v1/app_sessions') {
    const sid = (u.searchParams.get('sid') || '').replace(/^eq\./, '');
    if (method === 'GET') { const r = state.sessions.get(sid); return json(200, r ? [r] : []); }
    if (method === 'POST') { const b = JSON.parse(o.body); state.sessions.set(b.sid, b); return json(201, undefined); }
    if (method === 'DELETE') {
      const lt = (u.searchParams.get('expire_at') || '').replace(/^lt\./, '');
      if (sid) state.sessions.delete(sid); else if (lt) for (const [k, r] of state.sessions) if (r.expire_at < lt) state.sessions.delete(k);
      return json(204, undefined);
    }
  }
  const m = p.match(/^\/storage\/v1\/object\/submissions\/(.+)$/);
  if (m) {
    if (method === 'POST') { state.objects.set(m[1], { buf: Buffer.from(o.body), type: h['Content-Type'] }); return json(200, { Key: m[1] }); }
    if (method === 'GET') { const r = state.objects.get(m[1]); return r ? { ok: true, status: 200, arrayBuffer: async () => r.buf.buffer.slice(r.buf.byteOffset, r.buf.byteOffset + r.buf.length), headers: new Map([['content-type', r.type]]) } : json(404, { message: 'not found' }); }
    if (method === 'DELETE') { state.objects.delete(m[1]); return json(200, {}); }
  }
  return json(404, { message: 'unhandled ' + method + ' ' + p });
};
module.exports = { BASE, state };
