const router = require('express').Router(), crypto = require('crypto');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/user'), Task = require('../models/task'), Project = require('../models/project');
const mailer = require('../lib/mailer'), cleanup = require('../lib/cleanup'), A = require('../lib/access'), P = require('../lib/proj'), notify = require('../lib/notify'), dates = require('../lib/dates'), parse = require('../lib/parse'), boot = require('../lib/bootstrap'), { deny } = require('../lib/errors');
const { auth, role } = A;

passport.use(new LocalStrategy((username, password, done) => {
  const u = User.byLogin(username);
  if (!u) return done(null, false, { message: 'ไม่พบบัญชี (ใช้ชื่อผู้ใช้หรืออีเมลที่สมัครไว้)' });
  User.check(password, u.password).then(ok => ok ? done(null, u) : done(null, false, { message: 'รหัสผ่านไม่ถูกต้อง' }), done);
}));
passport.serializeUser((u, d) => d(null, u.id));
passport.deserializeUser((id, d) => d(null, User.get(id) || false));

// ---------- สมัคร/เข้าสู่ระบบ ----------
router.get('/login', (req, res) => res.render('login'));
router.post('/login', passport.authenticate('local', { successRedirect: '/', failureRedirect: '/login', failureFlash: true }));
router.get('/register', (req, res) => res.render('register'));
router.post('/register', async (req, res, next) => {
  try {
    const { name, username, email, password, password2, wantAdvisor } = req.body, errors = [], form = { name, username, email, wantAdvisor }, un = String(username || '').trim();
    if (!String(name || '').trim()) errors.push({ msg: 'กรอกชื่อ-สกุล' });
    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(un)) errors.push({ msg: 'ชื่อผู้ใช้ใช้ได้เฉพาะ A-Z a-z 0-9 _ . - ยาว 3–30 ตัวอักษร' });
    else if (un.toLowerCase() === boot.RESERVED) errors.push({ msg: 'ชื่อผู้ใช้นี้สงวนไว้สำหรับระบบ' });
    else if (User.byUsername(un)) errors.push({ msg: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
    if (!parse.EMAIL.test(String(email || '').trim())) errors.push({ msg: 'อีเมลไม่ถูกต้อง (ใช้ผูกกับโครงงานและส่งแจ้งเตือน)' });
    else if (User.byEmail(email)) errors.push({ msg: 'อีเมลนี้มีบัญชีอยู่แล้ว' });
    if (!password || password.length < 8) errors.push({ msg: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' });
    if (password !== password2) errors.push({ msg: 'รหัสผ่านไม่ตรงกัน' });
    if (errors.length) return res.status(400).render('register', { errors, form });
    // ทุกคนเริ่มเป็นบุคคลทั่วไป — ขอสิทธิ์อาจารย์ได้ ผู้ดูแลระบบเป็นผู้อนุมัติ
    await User.register({ name: String(name).trim(), username: un, email: String(email).trim().toLowerCase(), password, role: 'user', advisorRequest: !!wantAdvisor });
    req.flash('success_msg', 'สมัครสมาชิกสำเร็จ เข้าสู่ระบบได้เลย' + (wantAdvisor ? ' (คำขอสิทธิ์อาจารย์รอผู้ดูแลอนุมัติ)' : '')); res.redirect('/login');
  } catch (e) { next(e); }
});
router.get('/logout', auth, (req, res, next) => req.logout(e => e ? next(e) : res.redirect('/login')));

// ---------- ลืมรหัสผ่าน (ส่งลิงก์ทางอีเมล เมื่อตั้งค่า SMTP_URL + BASE_URL) ----------
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const baseUrl = () => (process.env.BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '')).replace(/\/+$/, '');
const byToken = t => User.all().find(u => u.resetHash && u.resetHash === sha(t) && u.resetExpires > Date.now());
router.get('/forgot', (req, res) => res.render('forgot', { mail: mailer.enabled && !!baseUrl() }));
router.post('/forgot', async (req, res, next) => {
  try {
    const u = User.byEmail(String(req.body.email || ''));
    if (u && mailer.enabled && baseUrl()) {
      const token = crypto.randomBytes(24).toString('hex'); User.update(u.id, { resetHash: sha(token), resetExpires: Date.now() + 36e5 });
      try { await mailer.send(u.email, '[SDU Task Tracker] ตั้งรหัสผ่านใหม่', `เปิดลิงก์นี้ภายใน 1 ชั่วโมงเพื่อตั้งรหัสผ่านใหม่:\n${baseUrl()}/reset/${token}\n\nถ้าคุณไม่ได้ขอ ให้ละเว้นอีเมลนี้`); }
      catch (e) { console.error(JSON.stringify({ level: 'error', code: 'EMAIL_SEND_FAILED', kind: 'reset', err: e.message })); }
    }
    req.flash('success_msg', 'ถ้ามีอีเมลนี้ในระบบและระบบส่งอีเมลได้ จะมีลิงก์ตั้งรหัสผ่านใหม่ส่งไปให้ (หมดอายุใน 1 ชั่วโมง) — ถ้าไม่ได้รับ ให้ติดต่อผู้ดูแลระบบ'); res.redirect('/login');
  } catch (e) { next(e); }
});
router.get('/reset/:token', (req, res) => byToken(req.params.token) ? res.render('reset', { token: req.params.token }) : deny(req, res, 'RESET_INVALID', 'ลิงก์หมดอายุหรือไม่ถูกต้อง ขอลิงก์ใหม่ได้ที่หน้านี้', '/forgot'));
router.post('/reset/:token', async (req, res, next) => {
  try {
    const u = byToken(req.params.token), back = '/reset/' + req.params.token, { password, password2 } = req.body;
    if (!u) return deny(req, res, 'RESET_INVALID', 'ลิงก์หมดอายุหรือไม่ถูกต้อง', '/forgot');
    if (!password || password.length < 8) return deny(req, res, 'PASSWORD_WEAK', 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร', back);
    if (password !== password2) return deny(req, res, 'PASSWORD_MISMATCH', 'รหัสผ่านไม่ตรงกัน', back);
    await User.setPassword(u.id, password, false); User.update(u.id, { resetHash: '', resetExpires: 0 });
    req.flash('success_msg', 'ตั้งรหัสผ่านใหม่แล้ว เข้าสู่ระบบได้เลย'); res.redirect('/login');
  } catch (e) { next(e); }
});

// ---------- บัญชีของฉัน ----------
router.get('/account', auth, (req, res) => res.render('account'));
router.post('/account/password', auth, async (req, res, next) => {
  try {
    const { current, password, password2 } = req.body;
    if (!(await User.check(String(current || ''), req.user.password))) return deny(req, res, 'PASSWORD_WRONG', 'รหัสผ่านปัจจุบันไม่ถูกต้อง', '/account');
    if (!password || password.length < 8) return deny(req, res, 'PASSWORD_WEAK', 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร', '/account');
    if (password !== password2) return deny(req, res, 'PASSWORD_MISMATCH', 'รหัสผ่านใหม่ไม่ตรงกัน', '/account');
    await User.setPassword(req.user.id, password, false); req.flash('success_msg', 'เปลี่ยนรหัสผ่านแล้ว'); res.redirect('/');
  } catch (e) { next(e); }
});

// ---------- แดชบอร์ดแยกตามบทบาท ----------
router.get('/', auth, (req, res) => {
  const u = req.user, pn = id => (Project.get(id) || {}).title;
  const rows = A.visibleProjects(u).map(P.row).sort((a, b) => (b.last || '').localeCompare(a.last || ''));
  const tasks = A.visibleTasks(u).map(t => ({ ...P.task(t), project: t.projectId ? pn(t.projectId) : '' })), byDue = (a, b) => (a.due || '9').localeCompare(b.due || '9');
  const open = tasks.filter(t => Task.SUBMITTABLE.includes(t.status)).sort(byDue), mine = rows.filter(r => A.level(u, r) === 'team');
  const d = { rows, isAdmin: u.role === 'admin', isAdvisor: u.role === 'advisor', isUser: u.role === 'user', needsProject: u.role === 'user' && !rows.length && !tasks.length,
    form: P.formWith({}, [], [], u.id), submitLink: mine.length === 1 ? '/projects/' + mine[0].id + '#submit' : '/projects', canSubmit: mine.length > 0, unlinked: mine.filter(r => !r.advisorLinked).length,
    todo: open.slice(0, 8), returned: tasks.filter(t => t.status === 'returned'), waiting: tasks.filter(t => t.status === 'submitted').sort(byDue), late: tasks.filter(t => t.phase === 'late').sort(byDue).slice(0, 8),
    pstat: { all: rows.length, doing: rows.filter(r => r.stK === 'doing').length, review: rows.filter(r => r.stK === 'review').length, done: rows.filter(r => r.stK === 'done').length } };
  if (d.isAdmin) {
    const old = dates.iso(dates.day(dates.today()) - 14), c = r => User.all().filter(x => x.role === r).length;
    d.sys = { users: User.all().length, advisors: c('advisor'), plain: c('user'), tasks: Task.all().length, pending: User.all().filter(x => x.advisorRequest && x.role === 'user').length,
      idle: rows.filter(r => r.stK !== 'done' && (r.last || '') < old).length, unlinked: rows.filter(r => !r.advisorLinked).length };
  }
  res.render('index', d);
});
router.get('/notifications', auth, (req, res) => { const list = notify.mine(req.user); notify.markRead(req.user); res.render('notifications', { list }); });

// ---------- ตารางเวลา (อาจารย์/ผู้ดูแล) ----------
router.get('/overview', auth, role('admin', 'advisor'), (req, res) => {
  const pid = req.query.p || '', projs = A.visibleProjects(req.user), D = dates.day;
  const tasks = A.visibleTasks(req.user).filter(t => !pid || t.projectId === pid).map(t => ({ ...P.task(t), project: t.projectId ? (Project.get(t.projectId) || {}).title : '— รายบุคคล —' }));
  const dated = tasks.filter(t => t.startDate || t.due).map(t => ({ ...t, s: D(t.startDate || t.due), e: D(t.due || t.startDate) })).sort((a, b) => a.s - b.s);
  let gantt = null;
  if (dated.length) {
    const min = Math.min(...dated.map(r => r.s)), max = Math.max(...dated.map(r => r.e)), span = max - min + 1, t0 = D(dates.today());
    gantt = { from: dates.iso(min), to: dates.iso(max), today: t0 >= min && t0 <= max ? ((t0 - min + .5) / span * 100).toFixed(2) : null,
      rows: dated.map(r => ({ id: r.id, title: r.title, project: r.project, phase: r.phase, startDate: r.startDate, due: r.due, left: ((r.s - min) / span * 100).toFixed(2), width: Math.max((r.e - r.s + 1) / span * 100, 1.5).toFixed(2) })) };
  }
  res.render('overview', { gantt, rows: tasks.sort((a, b) => (a.due || '9').localeCompare(b.due || '9')), projects: projs.map(p => ({ id: p.id, title: p.title, sel: p.id === pid })) });
});

// ---------- ผู้ดูแลระบบ: ผู้ใช้ / คะแนน ----------
router.get('/admin/users', auth, role('admin'), (req, res) => {
  res.render('users', { orphans: cleanup.scan(), users: User.all().map(u => ({ ...u, password: undefined, roleTh: User.ROLES[u.role], locked: u.id === boot.ADMIN_ID || u.id === req.user.id, pending: !!u.advisorRequest && u.role === 'user', owned: Project.all().filter(p => p.ownerId === u.id).length,
    roles: ['user', 'advisor', 'admin'].map(v => ({ v, l: User.ROLES[v], sel: u.role === v })) })) });
});
const target = (req, res, back) => { const u = User.get(req.params.id); if (!u) { deny(req, res, 'USER_NOT_FOUND', 'ไม่พบผู้ใช้', back); return null; } if (u.id === boot.ADMIN_ID || u.id === req.user.id) { deny(req, res, 'ADMIN_PROTECTED', 'บัญชีผู้ดูแลหลักและบัญชีของคุณเองแก้ไข/ลบจากหน้านี้ไม่ได้ (เปลี่ยนรหัสผ่านที่ "บัญชีของฉัน")', back); return null; } return u; };
router.post('/admin/users/:id/role', auth, role('admin'), (req, res) => {
  const u = target(req, res, '/admin/users'); if (!u) return;
  if (!['user', 'advisor', 'admin'].includes(req.body.role)) return deny(req, res, 'ROLE_INVALID', 'บทบาทไม่ถูกต้อง', '/admin/users');
  User.update(u.id, { role: req.body.role, advisorRequest: false }); if (req.body.role !== 'user') notify.add(u.id, req.body.role === 'admin' ? 'คุณได้รับสิทธิ์ผู้ดูแลระบบแล้ว' : 'คุณได้รับสิทธิ์อาจารย์แล้ว', '/');
  req.flash('success_msg', 'อัปเดตบทบาทแล้ว'); res.redirect('/admin/users');
});
router.post('/admin/users/:id/edit', auth, role('admin'), (req, res) => {
  const u = target(req, res, '/admin/users'); if (!u) return;
  const name = String(req.body.name || '').trim().slice(0, 120), email = String(req.body.email || '').trim();
  if (!name || !parse.EMAIL.test(email)) return deny(req, res, 'USER_INVALID', 'กรอกชื่อและอีเมลให้ถูกต้อง', '/admin/users');
  const other = User.byEmail(email); if (other && other.id !== u.id) return deny(req, res, 'EMAIL_TAKEN', 'อีเมลนี้มีบัญชีอยู่แล้ว', '/admin/users');
  User.update(u.id, { name, email: email.toLowerCase() }); req.flash('success_msg', 'บันทึกข้อมูลผู้ใช้แล้ว'); res.redirect('/admin/users');
});
router.post('/admin/users/:id/reset', auth, role('admin'), async (req, res, next) => {
  try {
    const u = target(req, res, '/admin/users'); if (!u) return;
    const temp = crypto.randomBytes(5).toString('hex'); await User.setPassword(u.id, temp, true);
    req.flash('success_msg', `รีเซ็ตรหัสผ่านของ ${u.name} แล้ว — รหัสชั่วคราว: ${temp} (แจ้งผู้ใช้ให้เปลี่ยนทันทีหลังเข้าสู่ระบบ)`); res.redirect('/admin/users');
  } catch (e) { next(e); }
});
router.post('/admin/users/:id/delete', auth, role('admin'), (req, res) => {
  const u = target(req, res, '/admin/users'); if (!u) return;
  const r = cleanup.forgetUser(u, { deleteOwned: req.body.owned === 'delete', adminId: req.user.id });
  req.flash('success_msg', `ลบผู้ใช้ ${u.name} และข้อมูลที่เกี่ยวข้องแล้ว (ถอดจากรายชื่อโครงงาน ${r.roster} รายการ, ลบงานรายบุคคล ${r.tasks} งาน` + (r.projectsMoved ? `, โอนโครงงาน ${r.projectsMoved} รายการให้คุณ` : '') + (r.projectsDeleted ? `, ลบโครงงาน ${r.projectsDeleted} รายการ` : '') + ')');
  res.redirect('/admin/users');
});
router.post('/admin/cleanup', auth, role('admin'), (req, res) => {
  const before = cleanup.scan(); cleanup.purge(req.user.id);
  req.flash('success_msg', `ล้างข้อมูลตกค้างแล้ว ${before.total} รายการ`); res.redirect('/admin/users');
});
router.get('/admin/scores', auth, role('admin'), (req, res) => {
  const rows = Task.all().filter(t => t.score !== undefined).map(t => { const p = Project.get(t.projectId) || {}; return { id: t.id, title: t.title, project: p.title || '— รายบุคคล —', owner: P.nameOf(t.assigneeId || p.ownerId), score: t.score, max: t.maxScore, note: t.scoreNote }; });
  res.render('scores', { rows });
});
module.exports = router;
