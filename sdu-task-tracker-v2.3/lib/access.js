const User = require('../models/user'), Task = require('../models/task'), Project = require('../models/project');
const lc = s => String(s || '').trim().toLowerCase();
const hit = (u, e) => (!!e.userId && e.userId === u.id) || (!!e.email && lc(e.email) === lc(u.email)); // ผูกบัญชีกับรายชื่อด้วยอีเมล
// ระดับสิทธิ์ต่อโครงงาน: admin (เห็นทั้งหมด) | advisor (อาจารย์ที่ระบุในโครงงาน) | team (เจ้าของ/สมาชิก) | null
const level = (u, p) => {
  if (!p) return null; if (u.role === 'admin') return 'admin';
  if (u.role === 'advisor' && (p.advisors || []).some(a => hit(u, a))) return 'advisor';
  if (p.ownerId === u.id || (p.members || []).some(m => hit(u, m))) return 'team';
  return null;
};
const uniq = a => [...new Set(a.filter(Boolean))];
// ระดับสิทธิ์ต่องาน: admin | advisor (อาจารย์ของโครงงาน หรือผู้ที่สร้าง/มอบหมายงานนั้น) | team (ผู้รับงานรายบุคคล หรือทีมของโครงงานสำหรับงานทีม) | null
const tlevel = (u, t) => {
  if (u.role === 'admin') return 'admin';
  const p = t.projectId ? Project.get(t.projectId) : null, pl = p ? level(u, p) : null;
  if (pl === 'advisor' || (u.role === 'advisor' && t.createdBy === u.id)) return 'advisor';
  if (t.assigneeId) return t.assigneeId === u.id ? 'team' : null; // งานรายบุคคล: เห็นเฉพาะผู้รับงานกับอาจารย์
  return pl === 'team' ? 'team' : null;
};
const teamUserIds = p => uniq([p.ownerId, ...User.all().filter(u => (p.members || []).some(m => hit(u, m))).map(u => u.id)]);
const advisorUserIds = p => User.all().filter(u => u.role === 'advisor' && (p.advisors || []).some(a => hit(u, a))).map(u => u.id);
Object.assign(exports, { level, uniq, tlevel, hit, teamUserIds, advisorUserIds,
  reviewers: t => uniq([...(t.projectId && Project.get(t.projectId) ? advisorUserIds(Project.get(t.projectId)) : []), ['advisor', 'admin'].includes((User.get(t.createdBy) || {}).role) ? t.createdBy : null]),
  recipients: t => t.assigneeId ? [t.assigneeId] : (t.projectId && Project.get(t.projectId) ? teamUserIds(Project.get(t.projectId)) : []), staff: l => l === 'admin' || l === 'advisor',
  canSeeProject: (u, p) => !!level(u, p), canSee: (u, t) => !!tlevel(u, t),
  visibleProjects: u => Project.all().filter(p => level(u, p)),
  visibleTasks: u => Task.all().filter(t => tlevel(u, t)),
  auth: (req, res, next) => req.isAuthenticated() ? next() : (req.flash('error_msg', 'กรุณาเข้าสู่ระบบก่อน'), res.redirect('/login')),
  role: (...r) => (req, res, next) => r.includes(req.user.role) ? next() : (req.flash('error_msg', 'ไม่มีสิทธิ์เข้าถึงหน้านี้'), res.redirect('/')) });
