const bcrypt = require('bcryptjs');
const col = require('../db').collection('users');
module.exports = Object.assign(col, {
  ROLES: { user: 'บุคคลทั่วไป', advisor: 'อาจารย์', admin: 'ผู้ดูแลระบบ' },
  byUsername: u => col.all().find(x => String(x.username).toLowerCase() === String(u).trim().toLowerCase()),
  byLogin: x => module.exports.byUsername(x) || module.exports.byEmail(x), // ล็อกอินด้วยชื่อผู้ใช้หรืออีเมลก็ได้
  byEmail: e => col.all().find(x => String(x.email).toLowerCase() === String(e).trim().toLowerCase()),
  async register(o) { o.email = String(o.email || '').trim().toLowerCase(); o.password = await bcrypt.hash(o.password, 10); return col.add(o); },
  async setPassword(id, plain, temporary) { return col.update(id, { password: await bcrypt.hash(plain, 10), defaultPw: !!temporary }); },
  check: (plain, hash) => bcrypt.compare(plain, hash)
});
