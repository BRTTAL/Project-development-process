const TZ = 'Asia/Bangkok';
exports.today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
exports.valid = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s)) ? s : '';
exports.day = s => Date.parse(s + 'T00:00:00Z') / 864e5;
exports.iso = n => new Date(n * 864e5).toISOString().slice(0, 10);
