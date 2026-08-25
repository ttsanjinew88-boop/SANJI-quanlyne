-- ============================================================
-- NHẮC NHỞ TELEGRAM (nguồn "Nhắc Nhở" trong tab Dữ Liệu) — chốt 25/08/2026
--
-- LÀM THEO ĐÚNG THỨ TỰ (1 lần duy nhất):
--
--   BƯỚC 1 — Bật 2 extension:
--     Supabase Dashboard -> Database -> Extensions -> bật  pg_cron  và  pg_net
--     (hoặc để mục 4 bên dưới tự bật; bật bằng giao diện chắc ăn hơn)
--
--   BƯỚC 2 — Thêm secret:
--     Edge Functions -> Secrets -> thêm  TG_CRON_KEY  = một chuỗi ngẫu nhiên do bạn tự đặt
--     (TG_BOT_TOKEN đã có sẵn từ super-function, KHÔNG cần thêm lại)
--
--   BƯỚC 3 — Deploy hàm:
--     supabase functions deploy tg-remind --no-verify-jwt
--     (hoặc Dashboard -> Edge Functions -> tạo hàm tên "tg-remind", dán file
--      supabase/functions/tg-remind/index.ts, rồi TẮT "Verify JWT" trong Details)
--
--   BƯỚC 4 — Chạy file SQL này: SQL Editor -> New query -> dán -> Run.
--     ⚠ TRƯỚC KHI RUN phải sửa 2 chỗ ở mục 4: <PROJECT_REF> và <TG_CRON_KEY>
--
--   BƯỚC 5 — Thêm bot vào các nhóm Telegram cần nhắc, lấy ID nhóm điền vào dashboard.
--
-- Kết quả đúng: "Success. No rows returned".
-- ============================================================


-- 1) BẢNG CHỐNG GỬI TRÙNG ------------------------------------
-- Mỗi mốc nhắc chỉ gửi ĐÚNG 1 LẦN cho mỗi nhóm mỗi ngày. Khóa chính chặn ở tầng
-- CSDL nên dù cron chạy chồng lượt cũng không thể gửi lặp.
create table if not exists public.tg_remind_sent(
  day_key   text not null,          -- YYYYMMDD theo giờ Việt Nam (GMT+7)
  group_id  text not null,          -- id nhóm nhận trong cấu hình
  rem_id    text not null,          -- id dòng nhắc
  tag       text not null,          -- mốc trong ngày: h<giờ> hoặc t<HHmm>
  sent_at   timestamptz not null default now(),
  primary key (day_key, group_id, rem_id, tag)
);
-- Không tạo policy nào = chỉ Edge Function (service_role) đụng được bảng này.
alter table public.tg_remind_sent enable row level security;


-- 2) LỊCH SỬ RIÊNG CỦA CHỨC NĂNG NHẮC NHỞ ---------------------
-- Tách khỏi audit_log chung để tab "Lịch Sử Nhắc Nhở" không lẫn với log toàn hệ thống.
create table if not exists public.tg_remind_log(
  id     bigserial primary key,
  at     timestamptz not null default now(),
  kind   text not null,             -- 'send' = bot gửi tin | 'cfg' = người dùng thao tác
  who    text,                      -- tên tài khoản, hoặc 'HỆ THỐNG' khi động cơ gửi
  detail text,
  status text                       -- 'ok' hoặc 'fail: <lý do>'
);
create index if not exists tg_remind_log_at_idx on public.tg_remind_log(at desc);
alter table public.tg_remind_log enable row level security;

drop policy if exists "tgremind_log_read"  on public.tg_remind_log;
drop policy if exists "tgremind_log_write" on public.tg_remind_log;

create policy "tgremind_log_read" on public.tg_remind_log
  for select to authenticated
  using (public.my_role() in ('admin','totruong'));

create policy "tgremind_log_write" on public.tg_remind_log
  for insert to authenticated
  with check (public.my_role() in ('admin','totruong'));


-- 3) QUYỀN GHI CẤU HÌNH NHẮC NHỞ ------------------------------
-- reports type='tgremind' month='all' = danh sách nhóm + mốc nhắc.
-- (type='tgremind_tick' do Edge Function ghi bằng service_role nên không cần policy.)
create or replace function public.can_write_report(t text)
returns boolean language sql security definer stable
set search_path = public
as $$
  select case
    when public.is_admin() then true
    when t in ('sop_index','sop_item','tgremind') then public.my_role() = 'totruong'
    when t in ('don','km')            then public.can_edit('data') or public.can_edit('ko')
    when t in ('shift','work')        then public.can_edit('shift')
    when t in ('anomaly','limits','ov') then public.can_edit('ko')
    when t = 'rids'                   then auth.uid() is not null
    else false
  end
$$;


-- 4) ĐỘNG CƠ: gọi Edge Function mỗi phút ----------------------
-- ⚠ SỬA 2 CHỖ TRƯỚC KHI CHẠY:
--     <PROJECT_REF>  = mã dự án Supabase (phần đầu URL, vd abcdefghijklm)
--     <TG_CRON_KEY>  = ĐÚNG chuỗi đã đặt ở secret TG_CRON_KEY tại BƯỚC 2
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Gỡ job cũ nếu chạy lại file này lần thứ hai (không lỗi khi chưa có)
do $$
begin
  perform cron.unschedule('tg-remind-tick');
exception when others then null;
end $$;

select cron.schedule(
  'tg-remind-tick',
  '* * * * *',
  $CRON$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/tg-remind',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-key','<TG_CRON_KEY>'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $CRON$
);


-- ============================================================
-- KIỂM TRA SAU KHI CHẠY
--   • Xem job đã tạo:      select * from cron.job;
--   • Xem 20 lượt gần nhất: select * from cron.job_run_details order by start_time desc limit 20;
--   • Trên dashboard: tab Dữ Liệu -> Nhắc Nhở, thanh trên cùng phải chuyển thành
--     "✅ Động cơ đang chạy" trong vòng 1–2 phút.
--
-- TẠM DỪNG TOÀN BỘ NHẮC NHỞ:  select cron.unschedule('tg-remind-tick');
-- BẬT LẠI: chạy lại mục 4.
-- ============================================================
