// ทดสอบชั้นข้อมูลของ Supabase ด้วยเซิร์ฟเวอร์จำลอง: node tests/run.js (ไม่ต้องต่อเน็ต)
process.env.SUPABASE_URL = 'https://fake.supabase.co'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test'; process.env.SESSION_SECRET = 't';
delete process.env.ADMIN_PASSWORD; delete process.env.ADMIN_EMAIL; delete process.env.VERCEL;
const fs = require('fs'), path = require('path'), assert = require('assert');
const { state } = require('./fake-supabase');
const db = require('../db'), User = require('../models/user'), Task = require('../models/task'), supa = require('../lib/supa'), files = require('../lib/files'), boot = require('../lib/bootstrap');
const users = db.collection('users'), tasks = db.collection('tasks');
let n = 0;
const test = async (name, fn) => { try { await fn(); n++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n    ', e.stack || e); process.exitCode = 1; } };
// รันหนึ่ง "คำขอ" จำลอง: โหลด snapshot → ทำงาน → res.end บันทึก → คืนสถานะ
const request = fn => new Promise((resolve, reject) => {
  const res = { statusCode: 200, setHeader() {}, end() { resolve(this.statusCode); } };
  db.context({ path: '/t' }, res, e => { if (e) return reject(e); Promise.resolve().then(() => fn(res)).catch(reject); });
});
// คำขอที่รอสัญญาณก่อนทำงาน เพื่อจำลองสองคำขอที่โหลดข้อมูลชุดเดียวกันแล้วเขียนพร้อมกัน
const gated = () => { let open; const gate = new Promise(r => { open = r; }); return { open, run: fn => request(async res => { await gate; fn(); res.end(); }) }; };
const records = c => [...state.records.values()].filter(r => r.collection === c);
(async () => {
  console.log('Supabase data layer');
  await test('เขียน/แก้/ลบ แล้วคำขอถัดไปเห็นข้อมูลจริง และ revision เพิ่มทีละ 1', async () => {
    await request(res => { users.add({ id: 'u1', name: 'ก', username: 'Alice', email: 'a@x.com' }); res.end(); });
    await request(res => { assert.strictEqual(users.all().length, 1); users.update('u1', { name: 'ข' }); res.end(); });
    assert.strictEqual(records('users')[0].revision, 2); assert.strictEqual(records('users')[0].data.name, 'ข');
    await request(res => { users.remove('u1'); res.end(); });
    assert.strictEqual(records('users').length, 0, 'ลบแล้วต้องไม่เหลือในฐานข้อมูล');
  });
  await test('คำขอที่ไม่เปลี่ยนข้อมูลไม่เรียก app_apply', async () => {
    state.calls.length = 0; await request(res => { users.all(); res.end(); });
    assert.ok(!state.calls.some(c => c.path.includes('app_apply')));
  });
  await test('แก้ระเบียนเดียวกันพร้อมกัน: คนที่สองได้ 409 และข้อมูลไม่ถูกเขียนทับ', async () => {
    await request(res => { tasks.add({ id: 't1', title: 'เดิม' }); res.end(); });
    const a = gated(), b = gated(); const pa = a.run(() => tasks.update('t1', { title: 'A' })), pb = b.run(() => tasks.update('t1', { title: 'B' }));
    await new Promise(r => setTimeout(r, 20)); a.open(); const sa = await pa; b.open(); const sb = await pb;
    assert.deepStrictEqual([sa, sb], [200, 409]); assert.strictEqual(records('tasks')[0].data.title, 'A');
  });
  await test('แก้คนละระเบียนพร้อมกัน ไม่ชนกัน', async () => {
    await request(res => { tasks.add({ id: 't2', title: 'x' }); res.end(); });
    const a = gated(), b = gated(); const pa = a.run(() => tasks.update('t1', { title: 'A2' })), pb = b.run(() => tasks.update('t2', { title: 'B2' }));
    await new Promise(r => setTimeout(r, 20)); a.open(); b.open(); assert.deepStrictEqual([await pa, await pb], [200, 200]);
  });
  await test('สมัครชื่อผู้ใช้/อีเมลซ้ำพร้อมกัน: ฐานข้อมูลปฏิเสธคนที่สอง (ไม่สนตัวพิมพ์)', async () => {
    const a = gated(), b = gated(); const pa = a.run(() => users.add({ name: 'A', username: 'Bob', email: 'bob@x.com' })), pb = b.run(() => users.add({ name: 'B', username: 'bob', email: 'other@x.com' }));
    await new Promise(r => setTimeout(r, 20)); a.open(); await pa; b.open(); assert.strictEqual(await pb, 409);
    assert.strictEqual(records('users').filter(r => r.data.username.toLowerCase() === 'bob').length, 1);
  });
  await test('หลายระเบียนในคำขอเดียวเป็นธุรกรรมเดียว: ชนหนึ่งรายการ ยกเลิกทั้งชุด', async () => {
    const before = JSON.stringify(records('tasks').map(r => r.data)); const a = gated(), b = gated();
    const pa = a.run(() => tasks.update('t1', { title: 'ชนะ' })), pb = b.run(() => { tasks.add({ id: 't3', title: 'ใหม่' }); tasks.update('t1', { title: 'แพ้' }); });
    await new Promise(r => setTimeout(r, 20)); a.open(); await pa; b.open(); assert.strictEqual(await pb, 409);
    assert.ok(!state.records.has('tasks/t3'), 'ระเบียนใหม่ของคำขอที่ล้มเหลวต้องไม่ถูกบันทึก'); assert.notStrictEqual(before, undefined);
  });
  await test('อ่านข้อมูลเกิน 1,000 แถวได้ครบ (รวมกรณีพอดี 2,000 ที่ได้ 416)', async () => {
    let i = 0; for (; i < 2000; i++) state.records.set('notifications/n' + i, { collection: 'notifications', id: 'n' + i, data: { id: 'n' + i, userId: 'x', createdAt: String(i) }, revision: 1, updated_at: ++state.seq });
    await request(res => { assert.strictEqual(db.collection('notifications').all().length, 2000); res.end(); });
    state.records.set('notifications/extra', { collection: 'notifications', id: 'extra', data: { id: 'extra', createdAt: 'z' }, revision: 1, updated_at: ++state.seq });
    await request(res => { assert.strictEqual(db.collection('notifications').all().length, 2001); res.end(); });
  });
  await test('บัญชี Admin ถูกสร้างครั้งเดียว แม้มีคำขอแรกพร้อมกัน และล็อกอินด้วยรหัสเริ่มต้นได้', async () => {
    await Promise.all([1, 2, 3].map(() => new Promise((ok, no) => boot.ensureAdmin({}, {}, e => e ? no(e) : ok()))));
    const admins = records('users').filter(r => r.data.username === 'Admin'); assert.strictEqual(admins.length, 1);
    assert.strictEqual(admins[0].id, 'admin-root'); assert.strictEqual(admins[0].data.role, 'admin'); assert.strictEqual(admins[0].data.defaultPw, true);
    assert.ok(await User.check('tiansmith735', admins[0].data.password));
    await request(res => { assert.ok(User.byLogin('ADMIN')); assert.ok(User.byLogin('admin@admin.invalid'), 'ล็อกอินด้วยอีเมลได้'); res.end(); });
  });
  await test('session store: บันทึก อ่าน หมดอายุ ลบ', async () => {
    const Store = require('../lib/sessionstore')({ Store: class {} });
    const call = (m, ...a) => new Promise((ok, no) => Store[m](...a, (e, r) => e ? no(e) : ok(r)));
    await call('set', 'sid1', { cookie: { expires: new Date(Date.now() + 6e4).toISOString() }, passport: { user: 'u' } });
    assert.strictEqual((await call('get', 'sid1')).passport.user, 'u');
    await call('set', 'sid2', { cookie: { expires: new Date(Date.now() - 6e4).toISOString() } }); assert.strictEqual(await call('get', 'sid2'), null);
    await call('destroy', 'sid1'); assert.strictEqual(await call('get', 'sid1'), null);
  });
  await test('ไฟล์ใน Supabase Storage: อัปโหลด ดาวน์โหลดผ่านแอป ลบ', async () => {
    await supa.storage.put('abc123.pdf', Buffer.from('%PDF-test'), 'application/pdf');
    const hdr = {}; const res = { set(k, v) { hdr[k] = v; }, send(b) { this.body = b; } };
    await files.serve(res, { stored: 'sb:abc123.pdf', name: 'รายงาน.pdf' });
    assert.strictEqual(res.body.toString(), '%PDF-test'); assert.ok(hdr['Content-Disposition'].startsWith('inline')); assert.strictEqual(hdr['X-Content-Type-Options'], 'nosniff');
    await supa.storage.put('x.zip', Buffer.from('zip'), 'application/zip'); const h2 = {}; await files.serve({ set(k, v) { h2[k] = v; }, send() {} }, { stored: 'sb:x.zip', name: 'a.zip' });
    assert.ok(h2['Content-Disposition'].startsWith('attachment')); assert.strictEqual(h2['Content-Type'], 'application/octet-stream');
    files.remove({ stored: 'sb:abc123.pdf' }); await new Promise(r => setTimeout(r, 10)); assert.ok(!state.objects.has('abc123.pdf'));
  });
  await test('ส่ง apikey เสมอ และคีย์ JWT รุ่นเก่าจึงใส่ Authorization เพิ่ม (sb_secret_ ไม่ใส่)', async () => {
    state.calls.length = 0; await supa.rest('GET', 'app_sessions?sid=eq.zz&select=sess,expire_at');
    assert.strictEqual(state.calls[0].headers.apikey, 'sb_secret_test'); assert.strictEqual(state.calls[0].headers.Authorization, undefined);
    delete require.cache[require.resolve('../lib/supa')]; process.env.SUPABASE_SECRET_KEY = 'eyJ.legacy.jwt'; const legacy = require('../lib/supa');
    state.calls.length = 0; await legacy.rest('GET', 'app_sessions?sid=eq.zz&select=sess,expire_at'); assert.strictEqual(state.calls[0].headers.Authorization, 'Bearer eyJ.legacy.jwt');
  });
  console.log('Vercel / ไฟล์');
  await test('lib/trace.js อ้างถึงทุกไฟล์ใน views/ และ public/ (เพื่อให้ Vercel รวมเข้าฟังก์ชัน)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../lib/trace.js'), 'utf8'), walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    const missing = [...walk(path.join(__dirname, '../views')), ...walk(path.join(__dirname, '../public'))].map(f => path.relative(path.join(__dirname, '..'), f).split(path.sep).join('/')).filter(f => !src.includes("'../" + f + "'"));
    assert.deepStrictEqual(missing, []);
  });
  await test('vercel.json ไม่มี functions/rewrites (ใช้ Express zero-config) และมี src/index.js ส่งออกแอป', () => {
    const v = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8')); assert.ok(!v.functions && !v.rewrites && !v.builds);
    assert.ok(/module\.exports\s*=\s*require\('\.\.\/app'\)/.test(fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8')));
    assert.ok(!fs.existsSync(path.join(__dirname, '../api')), 'ไม่ควรมีโฟลเดอร์ api/');
  });
  console.log(`\n${n} tests passed${process.exitCode ? ' — มีรายการที่ไม่ผ่าน' : ''}`);
})();
