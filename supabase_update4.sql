-- ============================================================
-- UPDATE 4: SIẾT RLS — ghi dữ liệu theo ĐÚNG QUYỀN, không chỉ "đã đăng nhập"
-- Chạy 1 lần trong SQL Editor (sau các file SQL trước)
-- Chặn nhân viên mở F12 tự sửa điểm / xóa dữ liệu dù giao diện không cho.
-- ============================================================

-- 1. Hàm kiểm tra quyền SỬA 1 tab của người đang đăng nhập (đọc profiles.perms)
create or replace function public.can_edit(tab text)
returns boolean language sql security definer stable
set search_path = public
as $$
  select case
    when coalesce((select is_admin from public.profiles where user_id = auth.uid()), false) then true
    else coalesce((select perms->>tab from public.profiles where user_id = auth.uid()), '') = 'edit'
  end
$$;

-- 2. Hàm: người đang đăng nhập có được GHI loại report này không
create or replace function public.can_write_report(t text)
returns boolean language sql security definer stable
set search_path = public
as $$
  select case
    when public.is_admin() then true                                   -- ADMIN: toàn quyền
    when t in ('don','km')            then public.can_edit('data') or public.can_edit('ko')
    when t in ('shift','work')        then public.can_edit('shift')
    when t in ('anomaly','limits','ov') then public.can_edit('ko')
    when t = 'rids'                   then auth.uid() is not null       -- đánh dấu rid đã dùng
    else false                                                          -- suspects/whiteip... chỉ ADMIN (đã true ở trên)
  end
$$;

-- 3. Thay policy "mở cho mọi người đăng nhập" bằng policy theo quyền
alter table public.reports enable row level security;
drop policy if exists "test_anon_all_reports" on public.reports;
drop policy if exists "auth_all_reports" on public.reports;
drop policy if exists "reports_select" on public.reports;
drop policy if exists "reports_insert" on public.reports;
drop policy if exists "reports_update" on public.reports;
drop policy if exists "reports_delete" on public.reports;

-- Đọc: ai đăng nhập cũng đọc được (cần cho việc xem)
create policy "reports_select" on public.reports
  for select to authenticated using (true);

-- Ghi mới / cập nhật: chỉ khi có quyền SỬA loại tương ứng
create policy "reports_insert" on public.reports
  for insert to authenticated with check (public.can_write_report(type));
create policy "reports_update" on public.reports
  for update to authenticated using (public.can_write_report(type)) with check (public.can_write_report(type));

-- Xóa (xóa dữ liệu tháng): chỉ ADMIN
create policy "reports_delete" on public.reports
  for delete to authenticated using (public.is_admin());

-- Ghi chú: Edge Function (webhook Telegram) dùng service_role nên bỏ qua RLS —
-- luồng cộng điểm khi bấm Xác Nhận vẫn chạy bình thường.
