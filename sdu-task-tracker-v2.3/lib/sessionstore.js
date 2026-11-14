// express-session store บน Supabase (ตาราง public.app_sessions) — จำเป็นบน Vercel เพราะหน่วยความจำไม่ถูกแชร์ระหว่าง invocation
const supa = require('./supa'), q = sid => 'sid=eq.' + encodeURIComponent(sid);
module.exports = session => new (class extends session.Store {
  get(sid, cb) { supa.rest('GET', `app_sessions?${q(sid)}&select=sess,expire_at`).then(rows => { const r = rows && rows[0]; cb(null, r && new Date(r.expire_at) > new Date() ? r.sess : null); }, cb); }
  set(sid, sess, cb) {
    const exp = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires) : new Date(Date.now() + 7 * 864e5);
    supa.rest('POST', 'app_sessions?on_conflict=sid', { body: { sid, sess, expire_at: exp.toISOString() }, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } }).then(() => cb && cb(), e => cb && cb(e));
  }
  destroy(sid, cb) { supa.rest('DELETE', `app_sessions?${q(sid)}`, { headers: { Prefer: 'return=minimal' } }).then(() => cb && cb(), e => cb && cb(e)); }
})();
