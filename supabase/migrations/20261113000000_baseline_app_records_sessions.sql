-- พื้นฐาน: ตารางเก็บข้อมูลทั้งระบบ (ทีละระเบียน) และเซสชัน — เปิด RLS ไว้และไม่มี policy จึงมีเพียงเซิร์ฟเวอร์ที่ใช้ secret key เข้าถึงได้
-- (โปรเจกต์ที่สร้างตารางนี้ไว้แล้ว ไม่ต้องรันไฟล์นี้ — ใช้ create ... if not exists จึงรันซ้ำได้ปลอดภัย)
create table if not exists public.app_records (
  collection text not null,
  id text not null,
  data jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create table if not exists public.app_sessions (
  sid text primary key,
  sess jsonb not null,
  expire_at timestamptz not null
);
create index if not exists app_sessions_expire_at_idx on public.app_sessions (expire_at);
alter table public.app_records enable row level security;
alter table public.app_sessions enable row level security;
revoke all on public.app_records, public.app_sessions from anon, authenticated;
grant select, insert, update, delete on public.app_records, public.app_sessions to service_role;
