# SDU Task Tracker — Design System (ย่อ)
โทเคน 3 ชั้นอยู่ท้าย `public/css/style.css`
| ชั้น | ตัวอย่าง | ใช้เมื่อ |
|---|---|---|
| Global | `--blue-600` ฟ้าน้ำทะเล, `--gold-500` ทอง | เปลี่ยนแบรนด์ |
| Semantic | `--color-action`, `--state-done/late/open/wait` | เปลี่ยนความหมาย |
| Component | `.phase-*` (ป้ายสถานะเวลา), `.g-bar` (แถบตารางเวลา), `.tk` (การ์ดงาน), `.stat` | ปรับหน้าตาคอมโพเนนต์ |

กติกา: สีสถานะเวลาใช้ชุดเดียวกันทั้งระบบ — เขียว=เสร็จ, แดง=เลยกำหนด, ฟ้า=เปิดให้ทำ, เทา=ยังไม่ถึงวันเริ่ม และต้องมีข้อความกำกับเสมอ (ไม่ใช้สีอย่างเดียว)
## รหัสข้อผิดพลาด (ฝั่งผู้ใช้ — log ระดับ info)
`PROJECT_INVALID` `PROJECT_NOT_FOUND` `PROJECT_REQUIRED` `TASK_TITLE_REQUIRED` `TASK_NOT_FOUND` `ASSIGNEE_REQUIRED` `DATE_INVALID` `DATE_RANGE` `TASK_NOT_STARTED` `TEAM_ONLY` `FORBIDDEN` `STATE_INVALID` `SUBMISSION_EMPTY` `SUBMISSION_PENDING` `ALREADY_APPROVED` `LINK_INVALID` `REVIEW_NOT_PENDING` `COMMENT_REQUIRED` `DECISION_INVALID` `SCORE_RANGE` `FILE_NOT_FOUND` `USER_NOT_FOUND` `USER_INVALID` `ADMIN_PROTECTED` `ROLE_INVALID` `EMAIL_TAKEN` `PASSWORD_WRONG` `PASSWORD_WEAK` `PASSWORD_MISMATCH` `RESET_INVALID`
ฝั่งระบบ (5xx): log ระดับ error พร้อม `requestId` · `DB_CORRUPT` ไฟล์ข้อมูลในเครื่องเสีย (สำรองแล้วหยุด) · `DB_LOAD_FAILED` / `DB_SAVE_FAILED` เชื่อมต่อ Supabase ไม่ได้ (ดู /healthz) · `DB_CONFLICT` แก้ระเบียนเดียวกันพร้อมกัน และ `DB_UNIQUE` ชื่อผู้ใช้/อีเมลซ้ำพร้อมกัน (ผู้ใช้ได้ 409 ให้ทำซ้ำ) · `STORAGE_UPLOAD_FAILED` / `STORAGE_DELETE_FAILED` ที่เก็บไฟล์ · `EMAIL_SEND_FAILED` ส่งอีเมลไม่สำเร็จ (แจ้งเตือนลองซ้ำเอง)
