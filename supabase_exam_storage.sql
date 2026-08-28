-- ============================================================
-- KIỂM TRA NGHIỆP VỤ (T5) — KHO ẢNH CÂU HỎI
-- Chạy 1 lần trong Supabase -> SQL Editor -> New query -> dán -> Run.
-- Chạy SAU `supabase_exam_setup.sql`.
--
-- Cơ chế giống tab Quy Trình Làm Việc (bucket `quytrinh`): bucket PRIVATE, ảnh
-- được nén WebP ~1920px ngay trên trình duyệt trước khi tải lên, hiển thị bằng
-- signed URL hạn 1 giờ. KHÔNG cần dán link, không phụ thuộc Google Drive.
--
-- Vì sao ai đăng nhập cũng ĐỌC được: nhân viên phải xem được ảnh minh họa lúc
-- làm bài và lúc tra cứu bài cũ. Ảnh không phải bí mật — đáp án mẫu mới là, và
-- cái đó nằm ở cột `answer` mà nhân viên không có quyền đọc.
-- ============================================================

-- 1. Bucket private (idempotent: chạy lại nhiều lần không sao)
insert into storage.buckets (id, name, public)
values ('baitest', 'baitest', false)
on conflict (id) do nothing;

-- 2. Policy: ai đăng nhập cũng xem được ảnh câu hỏi
drop policy if exists baitest_read on storage.objects;
create policy baitest_read on storage.objects
  for select to authenticated
  using (bucket_id = 'baitest');

-- 3. Policy: chỉ ADMIN + Tổ Trưởng được thêm / thay / xoá ảnh
drop policy if exists baitest_insert on storage.objects;
create policy baitest_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'baitest' and public.my_role() in ('admin','totruong'));

drop policy if exists baitest_update on storage.objects;
create policy baitest_update on storage.objects
  for update to authenticated
  using (bucket_id = 'baitest' and public.my_role() in ('admin','totruong'))
  with check (bucket_id = 'baitest' and public.my_role() in ('admin','totruong'));

drop policy if exists baitest_delete on storage.objects;
create policy baitest_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'baitest' and public.my_role() in ('admin','totruong'));
