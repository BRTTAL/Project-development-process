const User = require('../models/user'), Task = require('../models/task'), A = require('./access');
const nameOf = id => id ? ((User.get(id) || {}).name || 'ผู้ใช้ที่ถูกลบ') : '-';
exports.nameOf = nameOf;
exports.status = p => {
  const l = Task.all().filter(t => t.projectId === p.id);
  if (!l.length) return { k: 'new', th: 'ยังไม่มีงาน' };
  if (l.every(t => t.status === 'approved')) return { k: 'done', th: 'เสร็จสิ้น' };
  if (l.some(t => t.status === 'submitted')) return { k: 'review', th: 'รอตรวจ' };
  if (l.some(t => ['ack', 'doing', 'returned', 'approved'].includes(t.status))) return { k: 'doing', th: 'กำลังดำเนินการ' };
  return { k: 'todo', th: 'ยังไม่เริ่ม' };
};
exports.row = p => {
  const l = Task.all().filter(t => t.projectId === p.id), st = exports.status(p), done = l.filter(t => t.status === 'approved').length;
  const last = [p.createdAt, ...l.flatMap(t => [t.createdAt, ...(t.log || []).map(x => x.at)])].filter(Boolean).sort().pop();
  return { ...p, owner: nameOf(p.ownerId), teamSize: (p.members || []).length, advisorNames: (p.advisors || []).map(a => a.name).join(', '), advisorLinked: (p.advisors || []).some(a => User.all().some(u => u.role === 'advisor' && A.hit(u, a))), stK: st.k, stTh: st.th, total: l.length, pct: l.length ? Math.round(done * 100 / l.length) : 0, last };
};
exports.task = t => { const ph = Task.phase(t); return { ...t, statusTh: Task.STATUS[t.status], phase: ph, phaseTh: Task.PHASE[ph], assignee: t.assigneeId ? nameOf(t.assigneeId) : '', originTh: t.assigneeId ? 'มอบหมายรายบุคคล' : t.origin === 'advisor' ? 'อาจารย์มอบหมายทีม' : 'ทีมเพิ่มเอง' }; };
// ตัวเลือกอาจารย์/สมาชิกจากบัญชีในระบบ สำหรับฟอร์มโครงงาน (เลือกแล้วผูกบัญชีทันที ไม่ต้องพึ่งการพิมพ์อีเมลให้ตรง)
exports.formWith = (form, aSel, mSel, ownerId) => ({ ...form,
  advisorOpts: User.all().filter(u => u.role === 'advisor').map(u => ({ id: u.id, name: u.name, email: u.email, sel: (aSel || []).includes(u.id) })),
  memberOpts: User.all().filter(u => u.role === 'user' && u.id !== ownerId).map(u => ({ id: u.id, name: u.name, email: u.email, sel: (mSel || []).includes(u.id) })) });
