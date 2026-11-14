const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
exports.EMAIL = EMAIL;
// textarea หนึ่งบรรทัดต่อหนึ่งคน คั่นช่องด้วยจุลภาค/แท็บ เช่น "สมชาย ใจดี, 6512345678, a@b.com"
exports.list = (text, keys, max) => {
  const out = [], errors = [];
  String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, max).forEach((l, i) => {
    const p = l.split(/[,\t]/).map(x => x.trim()), o = {}; keys.forEach((k, j) => { o[k] = (p[j] || '').slice(0, 120); });
    if (!o.name) return errors.push(`บรรทัดที่ ${i + 1}: ไม่มีชื่อ`);
    o.email = o.email.toLowerCase();
    if (o.email && !EMAIL.test(o.email)) return errors.push(`บรรทัดที่ ${i + 1}: อีเมลไม่ถูกต้อง`);
    out.push(o);
  });
  return { out, errors };
};
exports.url = s => { try { const u = new URL(String(s).trim()); return ['http:', 'https:'].includes(u.protocol) ? u.href.slice(0, 500) : ''; } catch (e) { return ''; } };
exports.links = text => { // ลิงก์ http/https หนึ่งบรรทัดต่อหนึ่งลิงก์ (สูงสุด 5)
  const out = [], bad = [];
  String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 5).forEach(l => { const u = exports.url(l); u ? out.push(u) : bad.push(l); });
  return { out, bad };
};
