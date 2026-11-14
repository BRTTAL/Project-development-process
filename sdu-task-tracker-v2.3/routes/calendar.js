// ปฏิทินงาน: เดือน + รายการที่กำลังมาถึง + ดาวน์โหลด .ics
const router = require('express').Router();
const A = require('../lib/access'), P = require('../lib/proj'), dates = require('../lib/dates'), Project = require('../models/project');
router.use(A.auth);
const pad = n => String(n).padStart(2, '0'), bkk = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const visible = u => A.visibleTasks(u).map(t => ({ ...P.task(t), project: t.projectId ? (Project.get(t.projectId) || {}).title : '' }));
router.get('/calendar', (req, res) => {
  const today = dates.today(), m = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.m || '') ? req.query.m : today.slice(0, 7), [y, mo] = m.split('-').map(Number);
  const dow = new Date(m + '-01T00:00:00Z').getUTCDay(), dim = new Date(Date.UTC(y, mo, 0)).getUTCDate(), staff = req.user.role !== 'user', tasks = visible(req.user), ev = {};
  const add = (d, e) => { if (d) (ev[d] = ev[d] || []).push(e); };
  tasks.forEach(t => {
    add(t.due, { id: t.id, title: t.title, kind: 'due', label: 'ส่ง', phase: t.phase });
    if (t.startDate && t.startDate !== t.due) add(t.startDate, { id: t.id, title: t.title, kind: 'start', label: 'เริ่ม', phase: t.phase });
    if (staff && t.reviewDue && !t.reviewedAt && t.status === 'submitted') add(bkk(t.reviewDue), { id: t.id, title: t.title, kind: 'review', label: 'ตรวจ', phase: 'open' });
  });
  const cells = Array.from({ length: Math.ceil((dow + dim) / 7) * 7 }, (_, i) => { const d = i - dow + 1, date = d >= 1 && d <= dim ? `${m}-${pad(d)}` : ''; return { day: date ? d : '', empty: !date, today: date === today, events: ev[date] || [] }; });
  const weeks = []; for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const t0 = dates.day(today);
  const agenda = tasks.filter(t => t.status !== 'approved' && t.due && dates.day(t.due) - t0 <= 14).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 30).map(t => { const d = dates.day(t.due) - t0;
    return { id: t.id, title: t.title, project: t.project, due: t.due, statusTh: t.statusTh, status: t.status, phase: t.phase, text: d < 0 ? `เลยมา ${-d} วัน` : d === 0 ? 'วันนี้' : `อีก ${d} วัน`, late: d < 0, soon: d >= 0 && d <= 2 }; });
  res.render('calendar', { weeks, agenda, m, today: m === today.slice(0, 7), label: new Date(m + '-01T00:00:00Z').toLocaleDateString('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    prev: new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7), next: new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7) });
});
router.get('/calendar.ics', (req, res) => {
  const esc = s => String(s).replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n'), stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''), base = process.env.BASE_URL || '';
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SDU Task Tracker//TH', 'CALSCALE:GREGORIAN'];
  visible(req.user).filter(t => t.due && t.status !== 'approved').forEach(t => {
    const d0 = t.due.replace(/-/g, ''), d1 = dates.iso(dates.day(t.due) + 1).replace(/-/g, '');
    L.push('BEGIN:VEVENT', `UID:task-${t.id}@sdu-task-tracker`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d0}`, `DTEND;VALUE=DATE:${d1}`, `SUMMARY:${esc('ส่งงาน: ' + t.title)}`, `DESCRIPTION:${esc((t.project ? t.project + ' · ' : '') + t.statusTh + (base ? '\n' + base + '/tasks/' + t.id : ''))}`, 'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="tasks.ics"' }).send(L.join('\r\n') + '\r\n');
});
module.exports = router;
