const col = require('../db').collection('notifications');
// key ใช้กันแจ้งเตือนซ้ำ (เช่น เตือนใกล้ครบกำหนดครั้งเดียวต่อวันกำหนด)
exports.add = (userId, text, href, key) => {
  if (!userId || (key && col.all().some(n => n.key === key))) return;
  col.add({ userId, text, href: href || '/', key: key || '', read: false, emailed: false, attempts: 0 });
};
exports.mine = u => col.all().filter(n => n.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
exports.unread = u => col.all().filter(n => n.userId === u.id && !n.read).length;
exports.markRead = u => { col.all().filter(n => n.userId === u.id && !n.read).forEach(n => col.update(n.id, { read: true })); };
exports.pending = () => col.all().filter(n => !n.emailed && n.attempts < 5);
exports.update = (id, p) => col.update(id, p);
exports.all = () => col.all();
exports.remove = id => col.remove(id);
exports.removeFor = set => col.all().filter(n => set.has(n.userId)).forEach(n => col.remove(n.id));
