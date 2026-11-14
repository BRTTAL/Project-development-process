const dates = require('../lib/dates');
const col = require('../db').collection('tasks');
const STATUS = { todo: 'ยังไม่เริ่ม', assigned: 'อาจารย์มอบหมายแล้ว (รอรับทราบ)', ack: 'รับทราบแล้ว', doing: 'กำลังทำ', submitted: 'ส่งแล้ว รอตรวจ', returned: 'ตีกลับ — ต้องแก้ไข', approved: 'ตรวจผ่านแล้ว' };
const T = Object.assign(col, {
  STATUS, SUBMITTABLE: ['todo', 'assigned', 'ack', 'doing', 'returned'],
  PHASE: { done: 'เสร็จแล้ว', notstarted: 'ยังไม่ถึงวันเริ่ม', late: 'เลยกำหนด', open: 'เปิดให้ทำ' },
  phase(t) { const d = dates.today(); if (t.status === 'approved') return 'done'; if (t.startDate && d < t.startDate) return 'notstarted'; if (t.due && d > t.due) return 'late'; return 'open'; },
  // ย้ายข้อมูลรุ่นก่อนหน้า (v1.x: งานรายบุคคล/ไฟล์ระดับงาน) เข้ารูปแบบใหม่
  migrate() {
    let ch = false;
    col.all().forEach(t => {
      if (t.log) return; ch = true;
      t.log = []; t.origin = t.origin || 'advisor';
      t.status = { todo: 'assigned', doing: 'doing', review: 'submitted', done: 'approved' }[t.status] || t.status;
      if (!t.submissions) t.submissions = (t.files || []).map((f, i) => ({ id: f.id, userId: f.userId, round: i + 1, note: f.note || '', links: [], files: [{ id: f.id, name: f.name, stored: f.stored, size: f.size }], at: f.at, late: !!f.late, review: null }));
      ['files', 'assignments', 'assigneeIds', 'assigneeId'].forEach(k => delete t[k]);
    });
    const U = require('../db').collection('users'), P = require('../db').collection('projects');
    U.all().forEach(u => { if (u.role === 'student') { u.role = 'user'; ch = true; } });
    P.all().forEach(p => { if (!p.title) { p.title = p.name; p.advisors = p.advisors || []; p.members = p.members || []; ch = true; } });
    if (ch) require('../db').save();
  }
});
module.exports = T;
