-- ============================================================
-- TỪ KHÓA CẢNH BÁO (đồng bộ sang extension "Cảnh Báo NE") — chốt 03/09/2026
-- Chạy MỘT LẦN: SQL Editor -> New query -> dán -> Run.
-- Kết quả đúng: "Success. No rows returned".
--
-- Kiến trúc: bộ từ khóa nằm ở reports type='warnkw' month='all' (RLS như mọi report
-- khác). Bảng warnkw_pulse CHỈ chứa một con số phiên bản, dùng làm "chuông cửa"
-- Realtime. Dashboard của nhân viên (mở suốt ca, đã đăng nhập) nghe chuông rồi tự
-- đọc bộ từ khóa và đẩy sang extension. Server không làm gì giữa các lần TT sửa.
--
-- ⚠ TUYỆT ĐỐI KHÔNG bật Realtime thẳng trên bảng `reports`: bảng đó chứa dataset
--   don/km cả tháng (ma trận 31x24 cho mỗi nhân viên, hàng trăm KB mỗi dòng). Bật
--   lên là mỗi lần ai upload Excel hay gõ một đoạn trong Quy Trình Làm Việc thì cả
--   dòng đó bay qua WebSocket tới mọi dashboard đang mở.
-- ============================================================

-- 1) reports: cho Tổ Trưởng ghi type 'warnkw' -------------------------------
--    ⚠ Hàm này bị GHI ĐÈ TOÀN BỘ mỗi lần khai lại, nên phải liệt kê ĐỦ mọi type
--    đã thêm từ các file trước (sop_index/sop_item từ supabase_sop_totruong.sql,
--    tgremind từ supabase_remind_setup.sql). Thiếu một cái là mất quyền cái đó.
create or replace function public.can_write_report(t text)
returns boolean language sql security definer stable
set search_path = public
as $$
  select case
    when public.is_admin() then true                                   -- ADMIN: toàn quyền
    when t in ('sop_index','sop_item','tgremind','warnkw') then public.my_role() = 'totruong'
    when t in ('don','km')            then public.can_edit('data') or public.can_edit('ko')
    when t in ('shift','work')        then public.can_edit('shift')
    when t in ('anomaly','limits','ov') then public.can_edit('ko')
    when t = 'rids'                   then auth.uid() is not null       -- đánh dấu rid đã dùng
    else false
  end
$$;

-- 2) Bảng nhịp: đúng MỘT dòng, đúng một con số ------------------------------
create table if not exists public.warnkw_pulse (
  id smallint primary key default 1,
  v  bigint      not null default 0,
  at timestamptz not null default now(),
  constraint warnkw_pulse_one_row check (id = 1)
);
insert into public.warnkw_pulse (id, v) values (1, 0) on conflict (id) do nothing;

-- Realtime cần replica identity đầy đủ để áp RLS đúng khi phát sóng UPDATE
alter table public.warnkw_pulse replica identity full;

alter table public.warnkw_pulse enable row level security;

-- Đọc: mọi tài khoản đăng nhập (dashboard cần nghe nhịp)
drop policy if exists "warnkw_pulse_select" on public.warnkw_pulse;
create policy "warnkw_pulse_select" on public.warnkw_pulse
  for select to authenticated using (true);

-- Ghi: chỉ ADMIN + Tổ Trưởng (người sửa từ khóa mới được bấm chuông)
drop policy if exists "warnkw_pulse_update" on public.warnkw_pulse;
create policy "warnkw_pulse_update" on public.warnkw_pulse
  for update to authenticated
  using      (public.my_role() in ('admin','totruong'))
  with check (public.my_role() in ('admin','totruong'));

-- 3) Bật Realtime CHỈ cho bảng nhịp ------------------------------------------
--    Bọc trong DO vì chạy lại lần 2 sẽ báo lỗi "table is already member".
do $$
begin
  alter publication supabase_realtime add table public.warnkw_pulse;
exception
  when duplicate_object then null;
  when others then raise notice 'warnkw_pulse da nam trong publication, bo qua';
end $$;

-- ============================================================
-- KIỂM TRA SAU KHI CHẠY:
--   select * from public.warnkw_pulse;                       -- phải có 1 dòng id=1
--   select public.can_write_report('warnkw');                -- true nếu bạn là admin/TT
--   select tablename from pg_publication_tables
--    where pubname='supabase_realtime';                      -- phải thấy warnkw_pulse
--                                                            -- và KHÔNG được thấy reports
--
-- GỠ BỎ (nếu muốn tắt hẳn tính năng):
--   alter publication supabase_realtime drop table public.warnkw_pulse;
--   drop table public.warnkw_pulse;
--   -- rồi khai lại can_write_report bỏ chữ 'warnkw'
-- ============================================================
