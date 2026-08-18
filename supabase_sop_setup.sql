-- ============================================================
-- QUY TRÌNH CÔNG VIỆC (tab lớn T4) — chạy MỘT LẦN trên Supabase
-- SQL Editor -> New query -> dán toàn bộ -> Run
-- Sau khi chạy xong KHÔNG cần deploy lại Edge Function.
-- ============================================================

-- 1) BUCKET ẢNH (private: phải đăng nhập mới xem được ảnh)
--    Nếu bucket đã có thì câu này không làm gì (on conflict do nothing).
insert into storage.buckets (id, name, public)
values ('quytrinh', 'quytrinh', false)
on conflict (id) do nothing;

-- 2) QUYỀN TRÊN BUCKET — TẠM THỜI CHỈ ADMIN (đúng phạm vi đã chốt 18/08/2026)
--    is_admin() là hàm đã có sẵn từ supabase_auth_setup.sql / update2.
drop policy if exists "sop_img_read"   on storage.objects;
drop policy if exists "sop_img_write"  on storage.objects;
drop policy if exists "sop_img_update" on storage.objects;
drop policy if exists "sop_img_delete" on storage.objects;

create policy "sop_img_read" on storage.objects
  for select using (bucket_id = 'quytrinh' and is_admin());

create policy "sop_img_write" on storage.objects
  for insert with check (bucket_id = 'quytrinh' and is_admin());

create policy "sop_img_update" on storage.objects
  for update using (bucket_id = 'quytrinh' and is_admin());

create policy "sop_img_delete" on storage.objects
  for delete using (bucket_id = 'quytrinh' and is_admin());

-- 3) BẢNG reports — chỉ cần nếu RLS đang CHẶN 2 type mới ('sop_index', 'sop_item').
--    Bảng reports vốn đã cho ADMIN toàn quyền (is_admin()), nên thường KHÔNG phải chạy phần này.
--    Nếu lưu bị lỗi "new row violates row-level security policy" thì bỏ chú thích 5 dòng dưới rồi chạy lại.
-- drop policy if exists "sop_reports_all" on public.reports;
-- create policy "sop_reports_all" on public.reports
--   for all using (type in ('sop_index','sop_item') and is_admin())
--   with check (type in ('sop_index','sop_item') and is_admin());

-- ============================================================
-- MỞ RỘNG SAU NÀY: cho nhân viên XEM (không sửa)
-- Khi nào muốn mở, đổi 4 policy ở mục (2): giữ nguyên write/update/delete,
-- riêng "sop_img_read" đổi using thành:  bucket_id = 'quytrinh' and auth.role() = 'authenticated'
-- rồi trong dashboard bỏ điều kiện p.is_admin ở applyPerms (src/js/auth.js, #tsb4)
-- và SOP.canEdit() (src/js/sop.js) đổi sang kiểm quyền sửa riêng.
-- ============================================================
