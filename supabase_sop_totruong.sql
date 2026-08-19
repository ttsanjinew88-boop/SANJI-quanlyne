-- ============================================================
-- QUY TRÌNH LÀM VIỆC (T4) — cho TỔ TRƯỞNG sửa nội dung (chốt 19/08/2026)
-- Trước đó chỉ ADMIN ghi được. Chạy MỘT LẦN: SQL Editor -> New query -> dán -> Run.
-- Kết quả đúng: "Success. No rows returned".
-- ============================================================

-- 1) BẢNG reports — cho ghi 2 type 'sop_index' / 'sop_item' nếu là ADMIN hoặc Tổ Trưởng.
--    can_write_report() vốn trả false cho 2 type này (nhánh else) nên Tổ Trưởng bị chặn.
create or replace function public.can_write_report(t text)
returns boolean language sql security definer stable
set search_path = public
as $$
  select case
    when public.is_admin() then true                                   -- ADMIN: toàn quyền
    when t in ('sop_index','sop_item') then public.my_role() = 'totruong'  -- MỚI: Tổ Trưởng sửa quy trình
    when t in ('don','km')            then public.can_edit('data') or public.can_edit('ko')
    when t in ('shift','work')        then public.can_edit('shift')
    when t in ('anomaly','limits','ov') then public.can_edit('ko')
    when t = 'rids'                   then auth.uid() is not null       -- đánh dấu rid đã dùng
    else false
  end
$$;

-- 2) STORAGE bucket 'quytrinh' — tải lên / thay / xoá ảnh: ADMIN + Tổ Trưởng.
--    (Policy ĐỌC giữ nguyên: mọi tài khoản đăng nhập đều xem được ảnh.)
drop policy if exists "sop_img_write"  on storage.objects;
drop policy if exists "sop_img_update" on storage.objects;
drop policy if exists "sop_img_delete" on storage.objects;

create policy "sop_img_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'quytrinh' and public.my_role() in ('admin','totruong'));

create policy "sop_img_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'quytrinh' and public.my_role() in ('admin','totruong'));

create policy "sop_img_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'quytrinh' and public.my_role() in ('admin','totruong'));

-- ============================================================
-- SAU KHI CHẠY: Nhân viên = chỉ xem · Tổ Trưởng + ADMIN = xem và sửa.
-- Muốn thu lại quyền của Tổ Trưởng thì bỏ dòng 'sop_index','sop_item' ở mục 1
-- và đổi 3 policy mục 2 về public.is_admin().
-- ============================================================
