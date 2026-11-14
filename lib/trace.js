// ช่วยให้ Vercel รวมไฟล์เทมเพลต/CSS เข้าไปในฟังก์ชัน: ตัวติดตามไฟล์ของ Vercel (nft) เห็นเฉพาะ path ที่เขียนตรงๆ ในโค้ด
// ฟังก์ชันนี้ไม่เคยถูกเรียกใช้จริง — สร้างจากรายการไฟล์ใน views/ และ public/ (ตรวจความครบถ้วนด้วย npm test)
const fs = require('fs'), path = require('path');
module.exports = function traceAssets() {
  fs.readFileSync(path.join(__dirname, '../public/css/bootstrap.min.css'));
  fs.readFileSync(path.join(__dirname, '../public/css/style.css'));
  fs.readFileSync(path.join(__dirname, '../views/account.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/calendar.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/error.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/forgot.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/index.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/layouts/main.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/login.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/notifications.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/overview.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/partials/assignPicker.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/partials/projectForm.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/partials/projectTable.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/project.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/projectNew.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/projects.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/register.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/reset.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/scores.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/task.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/tasks.handlebars'));
  fs.readFileSync(path.join(__dirname, '../views/users.handlebars'));
};
