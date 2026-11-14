-- บัญชี: ชื่อผู้ใช้/อีเมลห้ามซ้ำ (ไม่สนตัวพิมพ์) ฐานข้อมูลบังคับให้เอง กันสมัครซ้ำพร้อมกัน
create unique index if not exists app_records_user_username_uq on public.app_records (lower(data->>'username')) where collection = 'users';
create unique index if not exists app_records_user_email_uq on public.app_records (lower(data->>'email')) where collection = 'users';
create index if not exists app_records_collection_idx on public.app_records (collection, updated_at);

-- บันทึกหลายระเบียนในธุรกรรมเดียว: ถ้ามีระเบียนใดชนกัน (revision ไม่ตรง) ยกเลิกทั้งชุด
create or replace function public.app_apply(p_changes jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  op jsonb;
  affected integer;
begin
  for op in select * from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) loop
    if op->>'op' = 'save' then
      insert into public.app_records(collection, id, data, revision, updated_at)
      values (op->>'collection', op->>'id', op->'data', 1, now())
      on conflict (collection, id) do update
        set data = excluded.data,
            revision = public.app_records.revision + 1,
            updated_at = now()
        where public.app_records.revision = (op->>'expected')::bigint;
      get diagnostics affected = row_count;
    elsif op->>'op' = 'delete' then
      delete from public.app_records
       where collection = op->>'collection' and id = op->>'id' and revision = (op->>'expected')::bigint;
      get diagnostics affected = row_count;
    else
      raise exception 'DB_BAD_OP' using errcode = 'P0001';
    end if;
    if affected <> 1 then
      raise exception 'DB_CONFLICT:%:%', op->>'collection', op->>'id' using errcode = 'P0001';
    end if;
  end loop;
end;
$$;
revoke all on function public.app_apply(jsonb) from public, anon, authenticated;
grant execute on function public.app_apply(jsonb) to service_role;

-- ที่เก็บไฟล์ส่งงาน: private (ไม่มี policy จึงเข้าได้เฉพาะเซิร์ฟเวอร์ที่ใช้ secret key)
insert into storage.buckets (id, name, public, file_size_limit)
values ('submissions', 'submissions', false, 10485760)
on conflict (id) do nothing;
