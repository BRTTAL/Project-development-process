// ลบข้อมูลให้หมดจริง: ลบผู้ใช้แล้วไม่เหลืออีเมล/ลิงก์ค้างในโครงงาน งาน และแจ้งเตือน + ตรวจ/ล้างข้อมูลตกค้างจากการลบรุ่นเก่า
const User = require('../models/user'), Project = require('../models/project'), Task = require('../models/task'), notify = require('./notify'), files = require('./files');
const lc = s => String(s || '').trim().toLowerCase();
const dropTask = t => { (t.submissions || []).forEach(s => (s.files || []).forEach(files.remove)); Task.remove(t.id); };
exports.deleteProject = p => { Task.all().filter(t => t.projectId === p.id).forEach(dropTask); Project.remove(p.id); };
const mentions = (e, u) => (e.userId && e.userId === u.id) || (u.email && lc(e.email) === lc(u.email));
// ลบผู้ใช้: ถอดชื่อ/อีเมลออกจากรายชื่อสมาชิกและอาจารย์ทุกโครงงาน ลบงานรายบุคคลของเขา โอน/ลบโครงงานที่เป็นเจ้าของ ลบแจ้งเตือน
exports.forgetUser = (u, { deleteOwned, adminId }) => {
  const r = { roster: 0, tasks: 0, projectsMoved: 0, projectsDeleted: 0 };
  Project.all().slice().forEach(p => {
    if (p.ownerId === u.id) { if (deleteOwned) { exports.deleteProject(p); r.projectsDeleted++; } else { Project.update(p.id, { ownerId: adminId }); r.projectsMoved++; } return; }
    const adv = (p.advisors || []).filter(a => !mentions(a, u)), mem = (p.members || []).filter(m => !mentions(m, u));
    if (adv.length !== (p.advisors || []).length || mem.length !== (p.members || []).length) { r.roster += (p.advisors || []).length - adv.length + (p.members || []).length - mem.length; Project.update(p.id, { advisors: adv, members: mem }); }
  });
  Task.all().filter(t => t.assigneeId === u.id).forEach(t => { dropTask(t); r.tasks++; });
  notify.removeFor(new Set([u.id])); User.remove(u.id);
  return r;
};
const orphans = () => {
  const uid = new Set(User.all().map(x => x.id)), pid = new Set(Project.all().map(x => x.id));
  const badRoster = Project.all().reduce((n, p) => n + [...(p.advisors || []), ...(p.members || [])].filter(e => e.userId && !uid.has(e.userId)).length, 0);
  return { badRoster, tasks: Task.all().filter(t => (t.assigneeId && !uid.has(t.assigneeId)) || (t.projectId && !pid.has(t.projectId))), projects: Project.all().filter(p => !uid.has(p.ownerId)), notes: notify.all().filter(n => !uid.has(n.userId)) };
};
exports.scan = () => { const o = orphans(); return { roster: o.badRoster, tasks: o.tasks.length, projects: o.projects.length, notifications: o.notes.length, total: o.badRoster + o.tasks.length + o.projects.length + o.notes.length }; };
exports.purge = adminId => {
  const o = orphans(), uid = new Set(User.all().map(x => x.id));
  Project.all().forEach(p => { const f = e => !(e.userId && !uid.has(e.userId)); if ((p.advisors || []).some(e => !f(e)) || (p.members || []).some(e => !f(e))) Project.update(p.id, { advisors: (p.advisors || []).filter(f), members: (p.members || []).filter(f) }); });
  o.tasks.forEach(dropTask); o.projects.forEach(p => Project.update(p.id, { ownerId: adminId })); o.notes.forEach(n => notify.remove(n.id));
  return exports.scan();
};
