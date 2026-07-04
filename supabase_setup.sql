-- ============================================================
-- SETUP SUPABASE CHO DASHBOARD (chạy 1 lần trong SQL Editor)
-- Supabase Dashboard -> SQL Editor -> New query -> dán toàn bộ -> Run
-- ============================================================

-- 1. Bảng lưu báo cáo đã xử lý, mỗi (loại, tháng) 1 dòng, upload lại sẽ ghi đè
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  type text not null,              -- 'don' | 'km' | 'bc'
  month text not null,             -- 'YYYY-MM'
  data jsonb not null,             -- snapshot dữ liệu đã xử lý
  updated_at timestamptz not null default now(),
  unique (type, month)
);

-- 2. Bật RLS + policy mở cho giai đoạn test (sẽ siết lại khi thêm đăng nhập)
alter table public.reports enable row level security;

drop policy if exists "test_anon_all_reports" on public.reports;
create policy "test_anon_all_reports" on public.reports
  for all using (true) with check (true);

-- 3. Bucket lưu file Excel gốc (backup)
insert into storage.buckets (id, name, public)
values ('originals', 'originals', false)
on conflict (id) do nothing;

drop policy if exists "test_anon_upload_originals" on storage.objects;
create policy "test_anon_upload_originals" on storage.objects
  for insert with check (bucket_id = 'originals');

drop policy if exists "test_anon_read_originals" on storage.objects;
create policy "test_anon_read_originals" on storage.objects
  for select using (bucket_id = 'originals');
