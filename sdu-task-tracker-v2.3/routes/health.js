// ตรวจสถานะการตั้งค่า/การเชื่อมต่อ (ไม่เปิดเผยความลับ): เปิด /healthz หลัง deploy เพื่อดูว่าขาดตัวแปรไหน และต่อ Supabase ได้ไหม
const router = require('express').Router(), supa = require('../lib/supa');
router.get('/healthz', async (req, res) => {
  const env = { SUPABASE_URL: !!process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: !!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY), SESSION_SECRET: !!process.env.SESSION_SECRET, CRON_SECRET: !!process.env.CRON_SECRET, ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD, SMTP_URL: !!process.env.SMTP_URL, BASE_URL: !!process.env.BASE_URL };
  const out = { ok: true, mode: supa.enabled ? 'supabase' : 'local-file', env };
  if (process.env.VERCEL && !(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY && env.SESSION_SECRET)) out.ok = false;
  if (supa.enabled) { try { await supa.rest('GET', 'app_records?select=id&limit=1'); await supa.rest('GET', 'app_sessions?select=sid&limit=1'); out.db = 'ok'; } catch (e) { out.ok = false; out.db = 'error ' + (e.code || '') + ': ' + e.message.slice(0, 120); } }
  res.status(out.ok ? 200 : 503).json(out);
});
module.exports = router;
