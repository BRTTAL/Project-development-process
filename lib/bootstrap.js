// บัญชีผู้ดูแลระบบหลัก: สร้างอัตโนมัติครั้งแรกที่เปิดเว็บ (ไม่ใช้ "ผู้ใช้คนแรก" เป็นผู้ดูแลอีกต่อไป) แก้ค่าได้ด้วย ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_EMAIL
// ADMIN_EMAIL (อีเมลจริง) ตั้งทีหลังได้: เริ่มระบบใหม่แล้วอีเมลของบัญชีหลักจะอัปเดตตาม ใช้ล็อกอินด้วยอีเมลได้ — คนอื่นสมัครด้วยอีเมลนี้ไม่ได้เพราะถูกใช้แล้ว
const db = require('../db'), User = require('../models/user');
const NAME = process.env.ADMIN_USERNAME || 'Admin', PW = process.env.ADMIN_PASSWORD || 'tiansmith735', ID = 'admin-root';
exports.RESERVED = NAME.toLowerCase(); exports.ADMIN_ID = ID;
let done = false, pending = null;
exports.ensureAdmin = (req, res, next) => {
  if (done) return next();
  if (!pending) pending = db.seed(async () => {
    const mail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase(), a = User.get(ID) || User.byUsername(NAME);
    if (!a) await User.register({ id: ID, name: 'ผู้ดูแลระบบ', username: NAME, email: mail || 'admin@admin.invalid', password: PW, role: 'admin', defaultPw: !process.env.ADMIN_PASSWORD });
    else if (mail && a.email !== mail) User.update(a.id, { email: mail });
  }).then(() => { done = true; }, e => { pending = null; throw e; });
  pending.then(() => next(), next);
};
