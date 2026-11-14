const express = require('express'), path = require('path'), crypto = require('crypto');
const { engine } = require('express-handlebars');
const session = require('express-session'), flash = require('connect-flash'), passport = require('passport');
const db = require('./db'), supa = require('./lib/supa');
require('./lib/trace'); // ให้ Vercel รวม views/ และ public/ เข้าฟังก์ชัน (ดูไฟล์นั้น)
const User = require('./models/user'), Task = require('./models/task'), notify = require('./lib/notify'), boot = require('./lib/bootstrap');
if (!db.REMOTE) Task.migrate();
const app = express(), port = process.env.PORT || 3000, onVercel = !!process.env.VERCEL;
const tf = { timeZone: 'Asia/Bangkok' };
app.set('trust proxy', 1); app.set('views', path.join(__dirname, 'views'));
app.engine('handlebars', engine({ defaultLayout: 'main', layoutsDir: path.join(__dirname, 'views/layouts'), partialsDir: path.join(__dirname, 'views/partials'), helpers: {
  date: d => d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', ...tf }) : '-',
  datetime: d => d ? new Date(d).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short', ...tf }) : '-',
  eq: (a, b) => a === b
} }));
app.set('view engine', 'handlebars');
app.use(express.static(path.join(__dirname, 'public')));
app.use('/', require('./routes/health')); // ตอบได้แม้ตั้งค่า/ฐานข้อมูลยังไม่พร้อม
const missing = onVercel ? [!process.env.SUPABASE_URL && 'SUPABASE_URL', !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) && 'SUPABASE_SECRET_KEY', !process.env.SESSION_SECRET && 'SESSION_SECRET'].filter(Boolean) : [];
if (missing.length) app.use((req, res) => res.status(503).send('<meta charset="utf-8"><h3>ยังตั้งค่าบน Vercel ไม่ครบ</h3><p>ขาดตัวแปร: <b>' + missing.join(', ') + '</b></p><p>ตั้งที่ Project → Settings → Environment Variables แล้ว Redeploy (ดู README) · ตรวจสถานะที่ /healthz</p>'));
app.use(express.urlencoded({ extended: false }));
app.use(session({ store: supa.enabled ? require('./lib/sessionstore')(session) : undefined, secret: process.env.SESSION_SECRET || 'dev-only-change-me', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 7 * 864e5 } }));
app.use(boot.ensureAdmin); // สร้างบัญชี Admin หลักถ้ายังไม่มี (ทำก่อนโหลดข้อมูลของคำขอ)
app.use(db.context);       // โหมด Supabase: โหลดข้อมูลต่อคำขอ + บันทึกก่อนตอบ
app.use(passport.initialize()); app.use(passport.session());
app.use(flash());
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg'); res.locals.error_msg = req.flash('error_msg'); res.locals.error = req.flash('error');
  const u = req.user;
  if (u) { const { password, ...safe } = u; res.locals.user = { ...safe, roleTh: User.ROLES[u.role], isAdmin: u.role === 'admin', isAdvisor: u.role === 'advisor', isStaff: u.role !== 'user' }; }
  res.locals.unread = u ? notify.unread(u) : 0;
  next();
});
app.use('/', require('./routes/cron'));
app.use('/', require('./routes/index'));
app.use('/', require('./routes/calendar'));
app.use('/', require('./routes/work'));
app.use((req, res) => res.status(404).render('error', { status: 404, message: 'ไม่พบหน้าที่ต้องการ' }));
app.use((err, req, res, next) => { // ข้อผิดพลาดระบบ: log ละเอียดฝั่งเซิร์ฟเวอร์ ผู้ใช้เห็นข้อความกลางๆ + รหัสอ้างอิง
  const id = crypto.randomBytes(4).toString('hex'), status = err.status || 500;
  if (req.dbSnap) req.dbSnap.dirty = false; // ทิ้งการเปลี่ยนแปลงที่ค้างจากคำขอที่ล้มเหลว
  if (status >= 500) console.error(JSON.stringify({ level: 'error', requestId: id, method: req.method, path: req.path, user: req.user && req.user.id, err: err.message, stack: err.stack }));
  if (res.headersSent) return next(err);
  res.status(status).render('error', { status, requestId: id, message: status < 500 ? err.message : 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง' });
});
module.exports = app; // Vercel ใช้ผ่าน api/index.js
if (require.main === module) {
  require('./lib/jobs').start();
  app.listen(port, () => console.log('SDU Task Tracker: http://localhost:' + port));
}
