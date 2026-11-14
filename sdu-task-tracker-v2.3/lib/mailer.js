// อีเมลเปิดใช้เมื่อกำหนด SMTP_URL (เช่น smtps://user:pass@smtp.example.com) — ไม่กำหนดก็ใช้แจ้งเตือนในระบบอย่างเดียว
let tx = null;
exports.enabled = !!process.env.SMTP_URL;
exports.send = async (to, subject, text) => {
  if (!tx) tx = require('nodemailer').createTransport({ url: process.env.SMTP_URL, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
  await tx.sendMail({ from: process.env.MAIL_FROM || 'SDU Task Tracker <no-reply@localhost>', to, subject, text });
};
