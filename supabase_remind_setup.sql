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


-- 2) LỊCH SỬ ---------------------------------------------------
-- KHÔNG có bảng riêng (chốt 25/08/2026): mọi thao tác ghi thẳng vào audit_log qua
-- logAction() và hiện ở tab "Lịch Sử" chung của hệ thống. Động cơ chỉ ghi khi GỬI HỎNG
-- (action 'NHẮC NHỞ LỖI', username 'BOT NHẮC NHỞ') — gửi thành công không ghi để khỏi
-- lấp kín tab Lịch Sử. Không cần chạy SQL gì thêm cho phần này.


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
-- ⚠ SỬA 3 CHỖ TRƯỚC KHI CHẠY:
--     <PROJECT_REF>  = mã dự án Supabase (phần đầu URL, vd abcdefghijklm)
--     <TG_CRON_KEY>  = ĐÚNG chuỗi đã đặt ở secret TG_CRON_KEY tại BƯỚC 2
--     <ANON_KEY>     = anon key của dự án (chính là SB_KEY trong dashboard_v2.html)
--
-- Vì sao phải gửi kèm Authorization + anon key?
--   Nếu hàm còn bật "Verify JWT", cổng Edge Function chặn mọi lời gọi KHÔNG có JWT
--   (trả 401 UNAUTHORIZED_NO_AUTH_HEADER) -> động cơ không bao giờ chạy. Anon key là
--   một JWT hợp lệ nên qua được cổng; quyền thật vẫn do x-cron-key quyết định bên trong
--   hàm. Gửi kèm cả hai = chạy đúng dù Verify JWT bật hay tắt.
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
    headers := jsonb_build_object(
                 'Content-Type','application/json',
                 'Authorization','Bearer <ANON_KEY>',
                 'x-cron-key','<TG_CRON_KEY>'),
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
