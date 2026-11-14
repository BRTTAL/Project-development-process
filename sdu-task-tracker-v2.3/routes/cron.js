// เรียกโดย Vercel Cron (vercel.json) หรือสั่งเอง: สร้างแจ้งเตือนใกล้ครบกำหนด + ส่งอีเมลค้างส่ง — ต้องมี CRON_SECRET
const router = require('express').Router(), crypto = require('crypto'), jobs = require('../lib/jobs'), supa = require('../lib/supa');
router.get('/cron/run', async (req, res, next) => {
  try {
    const sec = process.env.CRON_SECRET; if (!sec) return res.status(404).end();
    const got = Buffer.from(String(req.headers.authorization || '')), want = Buffer.from('Bearer ' + sec);
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return res.status(401).json({ error: 'unauthorized' });
    jobs.remind(); await jobs.sendPending();
    if (supa.enabled) await supa.rest('DELETE', 'app_sessions?expire_at=lt.' + encodeURIComponent(new Date().toISOString()), { headers: { Prefer: 'return=minimal' } }); // ล้าง session ที่หมดอายุ
    res.json({ ok: true });
  } catch (e) { next(e); }
});
module.exports = router;
