// โครงงาน + งาน (งานที่ต้องส่ง) : อาจารย์มอบหมาย หรือทีมเพิ่มเอง ส่งเป็นลิงก์/ไฟล์ได้ ตรวจผ่าน/ตีกลับได้หลายรอบ
const router = require('express').Router();
const User = require('../models/user'), Task = require('../models/task'), Project = require('../models/project');
const A = require('../lib/access'), P = require('../lib/proj'), parse = require('../lib/parse');
const files = require('../lib/files'), { nextId } = require('../db'), dates = require('../lib/dates'), { deny } = require('../lib/errors'), notify = require('../lib/notify');
const { level, staff, uniq } = A;
router.use(A.auth);
const nameOf = P.nameOf, now = () => new Date().toISOString();
const clean = (s, n) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, n), clip = (s, n) => String(s || '').trim().slice(0, n);
const lg = (by, text) => ({ at: now(), by, text });
const when = (v, tz) => { const ms = Date.parse(v + 'Z'); return isNaN(ms) ? '' : new Date(ms + Number(tz || 0) * 6e4).toISOString(); };
const types = () => uniq(Task.all().map(t => t.type));

// ---------- โครงงาน ----------
const dedupe = a => { const m = new Map(); a.forEach(x => { const k = String(x.email || x.name).toLowerCase(); if (!m.has(k)) m.set(k, x); }); return [...m.values()]; };
const acct = u => ({ name: u.name, email: u.email, userId: u.id });
const formOf = p => {
  const aSel = [], mSel = [], advText = [], memText = [];
  (p.advisors || []).forEach(a => { const u = User.all().find(x => x.role === 'advisor' && A.hit(x, a)); u ? aSel.push(u.id) : advText.push([a.name, a.email].filter(Boolean).join(', ')); });
  (p.members || []).forEach(m => { const u = User.all().find(x => x.role === 'user' && A.hit(x, m)); u ? mSel.push(u.id) : memText.push([m.name, m.sid, m.email].join(', ').replace(/(,\s*)+$/, '')); });
  return P.formWith({ editId: p.id, title: p.title, type: p.type, curriculum: p.curriculum, description: p.description, contact: p.contact, link: p.link, startDate: p.startDate, endDate: p.endDate, advisorsText: advText.join('\n'), membersText: memText.join('\n') }, aSel, mSel, p.ownerId);
};
const readProject = req => {
  const b = req.body, errors = [], title = clean(b.title, 200), start = dates.valid(b.startDate), end = dates.valid(b.endDate);
  if (!title) errors.push('กรุณากรอกชื่อโครงงาน');
  if ((b.startDate && !start) || (b.endDate && !end)) errors.push('รูปแบบวันที่ไม่ถูกต้อง'); else if (start && end && start > end) errors.push('วันเริ่มต้องไม่เกินวันสิ้นสุด');
  const adv = parse.list(b.advisorsText, ['name', 'email'], 5), mem = parse.list(b.membersText, ['name', 'sid', 'email'], 30), aIds = [].concat(b.advisorIds || []), mIds = [].concat(b.memberIds || []);
  const old = req.params.id && Project.get(req.params.id), owner = old ? old.ownerId : req.user.id;
  let advisors = dedupe([...aIds.map(id => User.get(id)).filter(u => u && u.role === 'advisor').map(acct), ...adv.out]);
  const members = dedupe([...mIds.map(id => User.get(id)).filter(u => u && u.role === 'user' && u.id !== owner).map(u => ({ ...acct(u), sid: '' })), ...mem.out]);
  if (req.user.role === 'advisor' && !advisors.length && !adv.errors.length) advisors = [acct(req.user)];
  if (!advisors.length && !adv.errors.length) errors.push('กรุณาเลือกหรือระบุอาจารย์ที่รับผิดชอบอย่างน้อย 1 คน');
  errors.push(...adv.errors.map(e => 'อาจารย์ ' + e), ...mem.errors.map(e => 'รายชื่อสมาชิก ' + e));
  let link = ''; if (b.link && !(link = parse.url(b.link))) errors.push('ลิงก์โครงงานต้องขึ้นต้นด้วย http:// หรือ https://');
  return { errors, form: P.formWith({ title: b.title, type: b.type, curriculum: b.curriculum, description: b.description, contact: b.contact, link: b.link, startDate: b.startDate, endDate: b.endDate, advisorsText: b.advisorsText, membersText: b.membersText, editId: req.params.id }, aIds, mIds, owner),
    value: { title, type: clean(b.type, 80), curriculum: clean(b.curriculum, 120), description: clip(b.description, 2000), contact: clip(b.contact, 200), link, startDate: start, endDate: end, advisors, members } };
};
router.get('/projects', (req, res) => {
  const q = String(req.query.q || '').toLowerCase(), f = req.query.f || '';
  const rows = A.visibleProjects(req.user).map(P.row).filter(p => (!q || p.title.toLowerCase().includes(q) || (p.type || '').toLowerCase().includes(q) || p.owner.toLowerCase().includes(q)) && (!f || p.stK === f)).sort((a, b) => (b.last || '').localeCompare(a.last || ''));
  res.render('projects', { rows, q, f });
});
router.get('/projects/new', (req, res) => res.render('projectNew', { form: P.formWith({}, [], [], req.user.id), first: !!req.query.first }));
router.post('/projects', (req, res) => {
  const r = readProject(req); if (r.errors.length) return res.status(400).render('projectNew', { errors: r.errors.map(msg => ({ msg })), form: r.form });
  const p = Project.add({ ...r.value, ownerId: req.user.id });
  A.advisorUserIds(p).forEach(id => notify.add(id, 'มีโครงงานใหม่ที่คุณเป็นอาจารย์ผู้รับผิดชอบ: ' + p.title, '/projects/' + p.id));
  req.flash('success_msg', 'เพิ่มโครงงานแล้ว — ส่งงานให้อาจารย์ได้ที่กล่อง "ส่งงานให้อาจารย์"'); res.redirect('/projects/' + p.id);
});
const canEditP = (u, p) => ['admin', 'advisor'].includes(level(u, p)) || p.ownerId === u.id;
router.get('/projects/:id', (req, res) => {
  const p = Project.get(req.params.id), lv = level(req.user, p); if (!lv) return deny(req, res, 'PROJECT_NOT_FOUND', 'ไม่พบโครงงานหรือไม่มีสิทธิ์', '/projects');
  const raw = Task.all().filter(t => t.projectId === p.id && A.tlevel(req.user, t)), tasks = raw.map(P.task).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')), row = P.row(p);
  const accounts = User.all().filter(u => u.role === 'advisor');
  res.render('project', { p: row, lv, isStaff: staff(lv), people: staff(lv) ? peopleList() : [], canEdit: canEditP(req.user, p), canDelete: lv === 'admin' || p.ownerId === req.user.id, tasks, form: formOf(p), types: types(),
    canSubmit: lv === 'team', noAdvisor: !row.advisorLinked, advisorsView: (p.advisors || []).map(a => ({ ...a, linked: accounts.some(u => A.hit(u, a)) })),
    openTasks: tasks.filter(t => A.tlevel(req.user, t) === 'team' && Task.SUBMITTABLE.includes(t.status) && t.phase !== 'notstarted').map(t => ({ id: t.id, title: t.title, statusTh: t.statusTh })),
    comments: [...(p.comments || [])].reverse().map(c => ({ ...c, name: nameOf(c.userId), by: (User.get(c.userId) || {}).role === 'user' ? '' : 'อาจารย์/ผู้ดูแล' })),
    activity: raw.flatMap(t => (t.log || []).map(l => ({ at: l.at, text: `${t.title}: ${l.text}`, by: nameOf(l.by), id: t.id }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8) });
});
router.post('/projects/:id/comments', (req, res) => {
  const p = Project.get(req.params.id), lv = level(req.user, p), back = '/projects/' + req.params.id, text = clip(req.body.text, 2000);
  if (!lv) return deny(req, res, 'PROJECT_NOT_FOUND', 'ไม่พบโครงงานหรือไม่มีสิทธิ์', '/projects');
  if (text) {
    Project.update(p.id, { comments: [...(p.comments || []), { userId: req.user.id, text, at: now() }] });
    (lv === 'team' ? A.advisorUserIds(p) : A.teamUserIds(p)).filter(id => id !== req.user.id).forEach(id => notify.add(id, `${req.user.name} แสดงความเห็นในโครงงาน: ${p.title}`, back));
  }
  res.redirect(back);
});
// ส่งงานให้อาจารย์จากหน้าโครงงาน: เลือกงานที่มีอยู่ หรือส่งเป็นงานใหม่ (สร้างงานให้อัตโนมัติ)
const finishSubmission = (req, res, o) => {
  const t = o.task, p = o.proj, fl = req.files || [], note = clip(req.body.note, 1000), lk = parse.links(req.body.links), errBack = o.errBack;
  if (lk.bad.length) { fl.forEach(files.remove); return deny(req, res, 'LINK_INVALID', 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https:// : ' + lk.bad.join(', '), errBack); }
  if (!fl.length && !lk.out.length && !note) return deny(req, res, 'SUBMISSION_EMPTY', 'กรุณาแนบลิงก์ ไฟล์ (' + files.OK.join(' ') + ') หรือข้อความอย่างน้อยหนึ่งอย่าง', errBack);
  const mkSub = (round, late) => ({ id: nextId(), userId: req.user.id, round, note, links: lk.out, files: fl.map(f => ({ id: nextId(), name: Buffer.from(f.originalname, 'latin1').toString('utf8'), stored: f.filename, size: f.size })), at: now(), late, review: null });
  let task = t, late = false;
  if (task) {
    late = !!(task.due && dates.today() > task.due); const round = (task.submissions || []).length + 1;
    Task.update(task.id, { status: 'submitted', reviewedAt: '', reviewNote: '', submissions: [...(task.submissions || []), mkSub(round, late)], log: [...task.log, lg(req.user.id, `ส่งงานรอบที่ ${round}${late ? ' (ส่งช้า)' : ''}`)] });
  } else task = Task.add({ projectId: p.id, title: o.title, type: o.type, description: '', startDate: '', due: '', reviewDue: '', status: 'submitted', origin: 'team', assigneeId: '', createdBy: req.user.id, comments: [], submissions: [mkSub(1, false)], log: [lg(req.user.id, 'ทีมเพิ่มงาน'), lg(req.user.id, 'ส่งงานรอบที่ 1')] });
  const round = task.submissions.length, rv = A.reviewers(task);
  rv.forEach(id => notify.add(id, `${req.user.name} ส่งงานรอบที่ ${round}: ${task.title}${p ? ` (${p.title})` : ''}`, '/tasks/' + task.id));
  req.flash('success_msg', `ส่งงานรอบที่ ${round} แล้ว` + (late ? ' (ส่งช้ากว่ากำหนด)' : '') + (rv.length ? '' : ' — แต่ยังไม่มีอาจารย์ที่ผูกบัญชีกับโครงงานนี้ อาจารย์จะยังไม่เห็นงาน กรุณาแก้ไขโครงงานแล้วเลือกอาจารย์จากรายชื่อในระบบ'));
  res.redirect('/tasks/' + task.id);
};
router.post('/projects/:id/submit', (req, res, next) => {
  const p = Project.get(req.params.id), back = '/projects/' + req.params.id;
  if (!p || level(req.user, p) !== 'team') return deny(req, res, 'TEAM_ONLY', 'เฉพาะเจ้าของ/สมาชิกโครงงานส่งงานได้', '/projects');
  req.proj = p; req.uploadBack = back; next();
}, files.upload, (req, res) => {
  const p = req.proj, back = '/projects/' + p.id, id = req.body.taskId;
  if (id) {
    const t = Task.get(id);
    if (!t || t.projectId !== p.id || A.tlevel(req.user, t) !== 'team') { (req.files || []).forEach(files.remove); return deny(req, res, 'TASK_NOT_FOUND', 'ไม่พบงานที่เลือก', back); }
    if (!Task.SUBMITTABLE.includes(t.status)) { (req.files || []).forEach(files.remove); return deny(req, res, t.status === 'approved' ? 'ALREADY_APPROVED' : 'SUBMISSION_PENDING', t.status === 'approved' ? 'งานนี้ตรวจผ่านแล้ว' : 'งานนี้ส่งไปแล้ว รออาจารย์ตรวจ', back); }
    if (t.startDate && dates.today() < t.startDate) { (req.files || []).forEach(files.remove); return deny(req, res, 'TASK_NOT_STARTED', 'ยังไม่ถึงวันเริ่มงาน (เริ่ม ' + t.startDate + ')', back); }
    return finishSubmission(req, res, { task: t, proj: p, errBack: back });
  }
  const title = clean(req.body.title, 200);
  if (!title) { (req.files || []).forEach(files.remove); return deny(req, res, 'TASK_TITLE_REQUIRED', 'กรุณากรอกชื่องาน/หัวข้อที่ส่ง หรือเลือกงานที่มีอยู่', back); }
  finishSubmission(req, res, { task: null, proj: p, title, type: clean(req.body.type, 60), errBack: back });
});
router.post('/projects/:id/edit', (req, res) => {
  const p = Project.get(req.params.id), back = '/projects/' + req.params.id;
  if (!p || !canEditP(req.user, p)) return deny(req, res, 'FORBIDDEN', 'ไม่มีสิทธิ์แก้ไขโครงงานนี้', '/projects');
  const r = readProject(req); if (r.errors.length) return deny(req, res, 'PROJECT_INVALID', r.errors.join(' • '), back);
  Project.update(p.id, r.value); req.flash('success_msg', 'แก้ไขโครงงานแล้ว'); res.redirect(back);
});
router.post('/projects/:id/delete', (req, res) => {
  const p = Project.get(req.params.id);
  if (!p || !(level(req.user, p) === 'admin' || p.ownerId === req.user.id)) return deny(req, res, 'FORBIDDEN', 'ลบได้เฉพาะเจ้าของโครงงานหรือผู้ดูแลระบบ', '/projects');
  require('../lib/cleanup').deleteProject(p); req.flash('success_msg', 'ลบโครงงานและงานทั้งหมดแล้ว'); res.redirect('/projects');
});
const countdown = (M, get, url, lvOf) => (req, res) => {
  const o = get(req), lv = o && lvOf(req.user, o);
  if (!o || !staff(lv)) return deny(req, res, 'FORBIDDEN', 'เฉพาะอาจารย์/ผู้ดูแลที่ตั้งเวลาตรวจสอบได้', '/');
  const a = req.body.action;
  if (a === 'done') M.update(o.id, { reviewedAt: now() });
  else if (a === 'clear') M.update(o.id, { reviewDue: '', reviewedAt: '' });
  else { const w = when(req.body.reviewDue, req.body.tz); if (!w) return deny(req, res, 'DATE_INVALID', 'กรุณาเลือกวันและเวลาตรวจสอบ', url(o)); M.update(o.id, { reviewDue: w, reviewedAt: '' }); }
  req.flash('success_msg', 'อัปเดตกำหนดตรวจสอบแล้ว'); res.redirect(url(o));
};
router.post('/projects/:id/review', countdown(Project, r => Project.get(r.params.id), o => '/projects/' + o.id, level));

// ---------- งาน ----------
const peopleList = () => User.all().filter(u => u.role === 'user').map(u => ({ id: u.id, name: u.name, email: u.email }));
// อาจารย์/ผู้ดูแล: มอบหมายให้บุคคลโดยตรง (แต่ละคนได้งานของตัวเอง ส่ง/ถูกตรวจแยกกัน) และ/หรือให้ทีมของโครงงาน — โครงงานเป็นตัวเลือก
// บุคคลทั่วไป: เพิ่มงานของทีมในโครงงานของตัวเอง
const createTask = (req, res, back) => {
  const u = req.user, b = req.body, p = b.projectId ? Project.get(b.projectId) : null, lv = p ? level(u, p) : null;
  if (b.projectId && !lv) return deny(req, res, 'PROJECT_NOT_FOUND', 'กรุณาเลือกโครงงานที่มีสิทธิ์', back);
  const title = clean(b.title, 200), start = dates.valid(b.startDate), due = dates.valid(b.due);
  if (!title) return deny(req, res, 'TASK_TITLE_REQUIRED', 'กรุณากรอกชื่องาน', back);
  if ((b.startDate && !start) || (b.due && !due)) return deny(req, res, 'DATE_INVALID', 'รูปแบบวันที่ไม่ถูกต้อง', back);
  if (start && due && start > due) return deny(req, res, 'DATE_RANGE', 'วันเริ่มต้องไม่เกินวันกำหนดส่ง', back);
  const manage = u.role === 'admin' || (u.role === 'advisor' && (!p || lv === 'advisor'));
  const base = { projectId: p ? p.id : '', title, type: clean(b.type, 60), description: clip(b.description, 2000), startDate: start, due, comments: [], submissions: [], createdBy: u.id }, where = p ? ` (${p.title})` : '';
  if (!manage) {
    if (!p) return deny(req, res, 'PROJECT_REQUIRED', 'กรุณาเลือกโครงงานที่จะเพิ่มงาน', back);
    const t = Task.add({ ...base, status: 'todo', origin: 'team', assigneeId: '', reviewDue: '', log: [lg(u.id, 'ทีมเพิ่มงาน')] });
    req.flash('success_msg', 'เพิ่มงานแล้ว'); return res.redirect('/tasks/' + t.id);
  }
  const who = uniq([].concat(b.assigneeIds || [])).filter(id => (User.get(id) || {}).role === 'user'), team = !!p && (!!b.assignTeam || !who.length);
  if (!who.length && !team) return deny(req, res, 'ASSIGNEE_REQUIRED', 'เลือกผู้รับงานอย่างน้อยหนึ่งคน หรือเลือกโครงงานเพื่อมอบหมายให้ทีม', back);
  const rd = when(b.reviewDue, b.tz), gid = nextId(), made = [];
  const mk = assigneeId => Task.add({ ...base, status: 'assigned', origin: 'advisor', assigneeId, groupId: gid, reviewDue: rd, assignedBy: u.id, log: [lg(u.id, 'มอบหมายงาน')] });
  if (team) { const t = mk(''); made.push(t); A.teamUserIds(p).forEach(id => notify.add(id, `มีงานใหม่ที่ได้รับมอบหมาย: ${title}${where}`, '/tasks/' + t.id)); }
  who.forEach(id => { const t = mk(id); made.push(t); notify.add(id, `คุณได้รับมอบหมายงาน: ${title}${where}`, '/tasks/' + t.id); });
  req.flash('success_msg', `มอบหมายงานแล้ว ${made.length} รายการ` + (who.length ? ` (รายบุคคล ${who.length} คน${team ? ' + ทีมโครงงาน' : ''})` : ' (ทีมโครงงาน)'));
  res.redirect(made.length === 1 ? '/tasks/' + made[0].id : back);
};
router.get('/tasks', (req, res) => {
  const u = req.user, q = String(req.query.q || '').toLowerCase(), f = req.query.f || '', pr = req.query.p || '', staffUser = u.role !== 'user';
  const rows = A.visibleTasks(u).filter(t => (!pr || t.projectId === pr) && (!q || t.title.toLowerCase().includes(q) || (t.type || '').toLowerCase().includes(q))).map(t => ({ ...P.task(t), project: t.projectId ? (Project.get(t.projectId) || {}).title : '— ไม่ผูกโครงงาน —' }))
    .filter(t => !f || (f === 'todo' && ['assigned', 'returned'].includes(t.status)) || (f === 'review' && t.status === 'submitted') || (f === 'late' && t.phase === 'late')).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  res.render('tasks', { rows, f, q, isStaffUser: staffUser, people: staffUser ? peopleList() : [], projects: A.visibleProjects(u).map(p => ({ id: p.id, title: p.title, sel: p.id === pr })), types: types() });
});
router.post('/tasks', (req, res) => createTask(req, res, '/tasks'));
router.post('/projects/:id/tasks', (req, res) => { req.body.projectId = req.params.id; createTask(req, res, '/projects/' + req.params.id); });

const load = (req, res, next) => {
  const t = Task.get(req.params.id), lv = t && A.tlevel(req.user, t);
  if (!lv) return deny(req, res, 'TASK_NOT_FOUND', 'ไม่พบงานหรือไม่มีสิทธิ์', '/tasks');
  Object.assign(req, { task: t, proj: t.projectId ? Project.get(t.projectId) : null, lv }); next();
};
const teamOnly = (req, res, next) => req.lv === 'team' ? next() : deny(req, res, 'TEAM_ONLY', 'เฉพาะสมาชิกโครงงานทำรายการนี้ได้', '/tasks/' + req.task.id);
const manageOnly = (req, res, next) => staff(req.lv) ? next() : deny(req, res, 'FORBIDDEN', 'เฉพาะอาจารย์/ผู้ดูแลทำรายการนี้ได้', '/tasks/' + req.task.id);
const started = (req, res, next) => req.task.startDate && dates.today() < req.task.startDate ? deny(req, res, 'TASK_NOT_STARTED', 'ยังไม่ถึงวันเริ่มงาน (เริ่ม ' + req.task.startDate + ')', '/tasks/' + req.task.id) : next();
const canEditT = (lv, t) => staff(lv) || (t.origin === 'team' && !(t.submissions || []).length && ['todo', 'doing'].includes(t.status));
const SHORT = { todo: 'ยังไม่เริ่ม', assigned: 'มอบหมาย', ack: 'รับทราบ', doing: 'กำลังทำ', submitted: 'ส่งแล้ว', approved: 'ผ่าน' };

router.get('/tasks/:id', load, (req, res) => {
  const t = req.task, v = P.task(t), u = req.user, adm = u.role === 'admin', team = req.lv === 'team', ph = v.phase;
  if (!adm) { delete v.score; delete v.maxScore; delete v.scoreNote; }
  const seq = t.origin === 'advisor' ? ['assigned', 'ack', 'doing', 'submitted', 'approved'] : ['todo', 'doing', 'submitted', 'approved'], cur = seq.indexOf(t.status === 'returned' ? 'doing' : t.status);
  const subs = [...(t.submissions || [])].sort((a, b) => b.round - a.round).map(s => ({ ...s, by: nameOf(s.userId), links: s.links || [], files: s.files.map(f => ({ ...f, kb: Math.ceil(f.size / 1024) })), pending: !s.review, approved: !!s.review && s.review.decision === 'approved', returned: !!s.review && s.review.decision === 'returned', reviewBy: s.review ? nameOf(s.review.by) : '' }));
  res.render('task', { t: v, project: req.proj ? P.row(req.proj) : null, isStaff: staff(req.lv), isTeam: team, canEdit: canEditT(req.lv, t), steps: seq.map((k, i) => ({ label: SHORT[k], cls: i < cur ? 'done' : i === cur ? 'cur' : '' })),
    canAck: team && t.status === 'assigned', canStart: team && ['todo', 'assigned', 'ack'].includes(t.status) && ph !== 'notstarted', canSubmit: team && Task.SUBMITTABLE.includes(t.status) && ph !== 'notstarted', notStarted: team && ph === 'notstarted', waiting: team && t.status === 'submitted', approvedDone: t.status === 'approved',
    subs, log: (t.log || []).map(l => ({ ...l, by: nameOf(l.by) })).reverse(), hasScore: v.score !== undefined, types: types(), okTypes: files.OK.join(' '), comments: (t.comments || []).map(c => ({ ...c, name: nameOf(c.userId) })) });
});
router.post('/tasks/:id/edit', load, (req, res) => {
  const b = req.body, back = '/tasks/' + req.task.id, start = dates.valid(b.startDate), due = dates.valid(b.due), title = clean(b.title, 200);
  if (!canEditT(req.lv, req.task)) return deny(req, res, 'FORBIDDEN', 'แก้ไขงานนี้ไม่ได้ในสถานะปัจจุบัน', back);
  if (!title) return deny(req, res, 'TASK_TITLE_REQUIRED', 'กรุณากรอกชื่องาน', back);
  if ((b.startDate && !start) || (b.due && !due)) return deny(req, res, 'DATE_INVALID', 'รูปแบบวันที่ไม่ถูกต้อง', back);
  if (start && due && start > due) return deny(req, res, 'DATE_RANGE', 'วันเริ่มต้องไม่เกินวันกำหนดส่ง', back);
  Task.update(req.task.id, { title, type: clean(b.type, 60), description: clip(b.description, 2000), startDate: start, due, log: [...req.task.log, lg(req.user.id, 'แก้ไขรายละเอียดงาน')] });
  req.flash('success_msg', 'แก้ไขงานแล้ว'); res.redirect(back);
});
const setStatus = (req, s, text) => Task.update(req.task.id, { status: s, log: [...req.task.log, lg(req.user.id, text)] });
router.post('/tasks/:id/ack', load, teamOnly, (req, res) => {
  const t = req.task, back = '/tasks/' + t.id;
  if (t.status !== 'assigned') return deny(req, res, 'STATE_INVALID', 'ทำรายการนี้ไม่ได้ในสถานะปัจจุบัน', back);
  setStatus(req, 'ack', 'รับทราบงาน'); A.reviewers(t).forEach(id => notify.add(id, `${req.user.name} รับทราบงาน: ${t.title}`, back)); req.flash('success_msg', 'รับทราบงานแล้ว'); res.redirect(back);
});
router.post('/tasks/:id/start', load, teamOnly, started, (req, res) => {
  const back = '/tasks/' + req.task.id;
  if (!['todo', 'assigned', 'ack'].includes(req.task.status)) return deny(req, res, 'STATE_INVALID', 'ทำรายการนี้ไม่ได้ในสถานะปัจจุบัน', back);
  setStatus(req, 'doing', 'เริ่มทำงาน'); req.flash('success_msg', 'เริ่มทำงานแล้ว'); res.redirect(back);
});
const submittable = (req, res, next) => Task.SUBMITTABLE.includes(req.task.status) ? next()
  : deny(req, res, req.task.status === 'approved' ? 'ALREADY_APPROVED' : 'SUBMISSION_PENDING', req.task.status === 'approved' ? 'งานนี้ตรวจผ่านแล้ว' : 'ส่งงานไปแล้ว รออาจารย์ตรวจก่อนจึงส่งใหม่ได้', '/tasks/' + req.task.id);
router.post('/tasks/:id/submit', load, teamOnly, started, submittable, files.upload, (req, res) => finishSubmission(req, res, { task: req.task, proj: req.proj, errBack: '/tasks/' + req.task.id }));
router.post('/tasks/:id/subs/:sid/review', load, manageOnly, (req, res) => {
  const t = req.task, s = (t.submissions || []).find(x => x.id === req.params.sid), back = '/tasks/' + t.id, d = req.body.decision, comment = clip(req.body.comment, 1000);
  if (!s) return deny(req, res, 'SUBMISSION_NOT_FOUND', 'ไม่พบรายการส่งงาน', back);
  if (s.review || t.status !== 'submitted') return deny(req, res, 'REVIEW_NOT_PENDING', 'รายการนี้ถูกตรวจไปแล้ว', back);
  if (!['approved', 'returned'].includes(d)) return deny(req, res, 'DECISION_INVALID', 'กรุณาเลือกผลการตรวจ', back);
  if (d === 'returned' && !comment) return deny(req, res, 'COMMENT_REQUIRED', 'กรุณาเขียนเหตุผลที่ตีกลับ เพื่อให้ทีมแก้ไขได้ถูกจุด', back);
  s.review = { decision: d, by: req.user.id, at: now(), comment };
  Task.update(t.id, { status: d, submissions: t.submissions, reviewedAt: now(), reviewNote: d === 'returned' ? comment : '', log: [...t.log, lg(req.user.id, d === 'approved' ? `ตรวจผ่าน (รอบที่ ${s.round})` : `ตีกลับให้แก้ไข (รอบที่ ${s.round}): ${comment}`)] });
  A.recipients(t).forEach(id => notify.add(id, d === 'approved' ? `งาน "${t.title}" ตรวจผ่านแล้ว` : `งาน "${t.title}" ถูกตีกลับ: ${comment}`, back));
  req.flash('success_msg', d === 'approved' ? 'บันทึกผลตรวจ: ผ่าน' : 'ตีกลับให้ทีมแก้ไขแล้ว'); res.redirect(back);
});
router.get('/tasks/:id/subs/:sid/files/:fid', load, (req, res, next) => {
  const s = (req.task.submissions || []).find(x => x.id === req.params.sid), f = s && s.files.find(x => x.id === req.params.fid);
  if (!f) return deny(req, res, 'FILE_NOT_FOUND', 'ไม่พบไฟล์', '/tasks/' + req.task.id);
  files.serve(res, f).catch(next);
});
router.post('/tasks/:id/review', load, (req, res, next) => countdown(Task, r => r.task, o => '/tasks/' + o.id, A.tlevel)(req, res, next));
router.post('/tasks/:id/score', load, A.role('admin'), (req, res) => {
  const max = Number(req.body.max) || 100, s = Number(req.body.score), back = '/tasks/' + req.task.id;
  if (req.body.score === '' || isNaN(s) || s < 0 || s > max) return deny(req, res, 'SCORE_RANGE', 'คะแนนต้องอยู่ระหว่าง 0 ถึงคะแนนเต็ม', back);
  Task.update(req.task.id, { score: s, maxScore: max, scoreNote: clean(req.body.note, 500) }); req.flash('success_msg', 'บันทึกคะแนนแล้ว'); res.redirect(back);
});
router.post('/tasks/:id/comments', load, (req, res) => {
  const text = clip(req.body.text, 2000);
  if (text) Task.update(req.task.id, { comments: [...(req.task.comments || []), { userId: req.user.id, text, at: now() }] });
  res.redirect('/tasks/' + req.task.id);
});
router.post('/tasks/:id/delete', load, (req, res) => {
  if (!canEditT(req.lv, req.task)) return deny(req, res, 'FORBIDDEN', 'ลบงานนี้ไม่ได้ในสถานะปัจจุบัน', '/tasks/' + req.task.id);
  const pid = req.task.projectId; (req.task.submissions || []).forEach(s => s.files.forEach(files.remove)); Task.remove(req.task.id);
  req.flash('success_msg', 'ลบงานแล้ว'); res.redirect('/projects/' + pid);
});
module.exports = router;
