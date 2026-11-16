const COLS = ['users', 'projects', 'tasks', 'notifications'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SECRET_KEY || '';
  if (!url || !key) return res.status(503).json({ ok: false, error: 'missing env' });
  try {
    const headers = { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}) };
    const r = await fetch(url + '/rest/v1/app_records?select=collection&limit=1000', { headers, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return res.status(502).json({ ok: false, error: 'supabase ' + r.status });
    const rows = await r.json();
    return res.status(200).json({ ok: true, counts: Object.fromEntries(COLS.map(c => [c, rows.filter(x => x.collection === c).length])) });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'connect failed' });
  }
}
