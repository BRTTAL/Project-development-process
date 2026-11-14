// ข้อผิดพลาดฝั่งผู้ใช้ (4xx) => แจ้งข้อความ + รหัสคงที่ ไม่ log ระดับ error
// ข้อผิดพลาดฝั่งระบบ (5xx) => log พร้อม requestId แสดงข้อความกลางๆ ให้ผู้ใช้
exports.deny = (req, res, code, message, back) => {
  console.info(JSON.stringify({ level: 'info', code, user: req.user && req.user.id, method: req.method, path: req.path }));
  req.flash('error_msg', message); return res.redirect(back || '/');
};
exports.httpError = (status, message) => Object.assign(new Error(message), { status });
