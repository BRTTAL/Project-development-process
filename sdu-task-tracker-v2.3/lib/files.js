// ที่เก็บไฟล์: ดิสก์ (รันในเครื่อง) หรือ Supabase Storage (bucket "submissions" แบบ private) เมื่อมี SUPABASE_URL + SUPABASE_SECRET_KEY
const multer = require('multer'), path = require('path'), fs = require('fs'), crypto = require('crypto'), db = require('../db'), supa = require('./supa');
const REMOTE = supa.enabled;
const DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
if (!REMOTE) fs.mkdirSync(DIR, { recursive: true });
const MAX_MB = Number(process.env.MAX_UPLOAD_MB) || (process.env.VERCEL ? 4 : 10), MAX = MAX_MB * 1048576; // ฟังก์ชันบน Vercel รับ body จำกัด จึงตั้งต้น 4 MB
const OK = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.zip', '.png', '.jpg', '.jpeg'];
const MIME = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8' };
const INLINE = Object.keys(MIME), ext = n => path.extname(String(n)).toLowerCase(), isRemote = s => String(s).startsWith('sb:');
const up = multer({
  storage: REMOTE ? multer.memoryStorage() : multer.diskStorage({ destination: DIR, filename: (q, f, cb) => cb(null, crypto.randomBytes(16).toString('hex') + ext(f.originalname)) }),
  limits: { fileSize: MAX, files: 5 }, fileFilter: (q, f, cb) => cb(null, OK.includes(ext(f.originalname)))
}).array('files', 5);
const logErr = (code, e) => console.error(JSON.stringify({ level: 'error', code, err: e.message }));
exports.upload = (req, res, next) => {
  const reenter = db.keep(), back = req.uploadBack || '/tasks/' + req.params.id, fail = msg => { req.flash('error_msg', msg); res.redirect(back); };
  up(req, res, e => reenter(async () => { try {
    if (e) { (req.files || []).forEach(f => f.path && fs.unlink(f.path, () => {})); return fail(e.code === 'LIMIT_FILE_SIZE' ? `ไฟล์ใหญ่เกิน ${MAX_MB} MB` : ['LIMIT_UNEXPECTED_FILE', 'LIMIT_FILE_COUNT'].includes(e.code) ? 'แนบได้ไม่เกิน 5 ไฟล์' : 'อัปโหลดไม่สำเร็จ'); }
    if (REMOTE && req.files && req.files.length) {
      const done = [];
      try { for (const f of req.files) { const key = crypto.randomBytes(12).toString('hex') + ext(f.originalname); await supa.storage.put(key, f.buffer, MIME[ext(f.originalname)]); done.push(key); f.filename = 'sb:' + key; f.buffer = undefined; } }
      catch (err) { logErr('STORAGE_UPLOAD_FAILED', err); done.forEach(k => supa.storage.del(k).catch(() => {})); return fail('อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่'); }
    }
    next();
  } catch (err) { next(err); } }));
};
exports.remove = f => { if (isRemote(f.stored)) supa.storage.del(f.stored.slice(3)).catch(e => logErr('STORAGE_DELETE_FAILED', e)); else fs.unlink(path.join(DIR, path.basename(f.stored)), () => {}); };
// ส่งไฟล์ผ่านระบบตรวจสิทธิ์ของแอปเสมอ (pdf/รูป/txt เปิดในเบราว์เซอร์ ที่เหลือดาวน์โหลด)
exports.serve = async (res, f) => {
  const e = ext(f.stored), inline = INLINE.includes(e), cd = (inline ? 'inline' : 'attachment') + "; filename*=UTF-8''" + encodeURIComponent(f.name);
  res.set('X-Content-Type-Options', 'nosniff'); res.set('Content-Disposition', cd);
  if (isRemote(f.stored)) { const r = await supa.storage.get(f.stored.slice(3)); res.set('Content-Type', inline ? MIME[e] : 'application/octet-stream'); return res.send(r.buf); }
  if (!inline) res.set('Content-Type', 'application/octet-stream');
  return res.sendFile(path.join(DIR, path.basename(f.stored)));
};
Object.assign(exports, { OK, ext, MAX_MB });
