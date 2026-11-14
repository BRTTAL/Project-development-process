// งานเบื้องหลัง: (1) สร้างแจ้งเตือนใกล้ครบกำหนด/เลยกำหนด/ถึงเวลาตรวจ (2) ส่งอีเมลที่ค้างอยู่
// การลองส่งซ้ำอยู่ชั้นเดียวคือที่นี่ (backoff 2^n นาที สูงสุด 5 ครั้ง) — การร้องขอจากผู้ใช้ไม่ส่งอีเมลตรงๆ
const Task = require('../models/task'), Project = require('../models/project'), User = require('../models/user');
const A = require('./access'), notify = require('./notify'), mailer = require('./mailer'), dates = require('./dates');
const logErr = (code, e, extra) => console.error(JSON.stringify({ level: 'error', code, err: e.message, ...extra }));
function remind() {
  const today = dates.today(), soon = dates.iso(dates.day(today) + 2);
  Task.all().filter(t => t.status !== 'approved').forEach(t => {
    const p = t.projectId ? Project.get(t.projectId) : null, where = p ? ` (${p.title})` : '';
    if (t.due && Task.SUBMITTABLE.includes(t.status)) A.recipients(t).forEach(id => {
      if (t.due < today) notify.add(id, `งาน "${t.title}"${where} เลยกำหนดส่งแล้ว (${t.due})`, '/tasks/' + t.id, `late:${t.id}:${id}:${t.due}`);
      else if (t.due <= soon) notify.add(id, `งาน "${t.title}"${where} ใกล้ถึงกำหนดส่ง (${t.due})`, '/tasks/' + t.id, `soon:${t.id}:${id}:${t.due}`);
    });
    if (t.reviewDue && !t.reviewedAt && t.status === 'submitted' && Date.parse(t.reviewDue) - Date.now() < 864e5)
      A.reviewers(t).forEach(id => notify.add(id, `ใกล้ถึงเวลาตรวจงาน "${t.title}"${where}`, '/tasks/' + t.id, `rev:${t.id}:${t.reviewDue}:${id}`));
  });
}
async function sendPending() {
  if (!mailer.enabled) return;
  for (const n of notify.pending()) {
    const u = User.get(n.userId);
    if (!u || !u.email) { notify.update(n.id, { emailed: true }); continue; }
    if (Date.now() < (n.nextTry || 0)) continue;
    try { await mailer.send(u.email, '[SDU Task Tracker] ' + n.text.slice(0, 80), n.text + '\n\n' + (process.env.BASE_URL || '') + n.href); notify.update(n.id, { emailed: true }); }
    catch (e) { notify.update(n.id, { attempts: n.attempts + 1, nextTry: Date.now() + 6e4 * 2 ** n.attempts }); logErr('EMAIL_SEND_FAILED', e, { notification: n.id, attempts: n.attempts + 1 }); }
  }
}
exports.remind = remind; exports.sendPending = sendPending; // เรียกจาก /cron/run บน Vercel
exports.start = () => {
  const safe = (fn, code) => () => { try { Promise.resolve(fn()).catch(e => logErr(code, e)); } catch (e) { logErr(code, e); } };
  safe(remind, 'REMINDER_JOB_FAILED')();
  setInterval(safe(remind, 'REMINDER_JOB_FAILED'), 30 * 6e4).unref();
  setInterval(safe(sendPending, 'EMAIL_JOB_FAILED'), 6e4).unref();
  if (!mailer.enabled) console.info(JSON.stringify({ level: 'info', code: 'EMAIL_DISABLED', msg: 'ไม่ได้ตั้งค่า SMTP_URL — ใช้แจ้งเตือนในระบบอย่างเดียว' }));
};
