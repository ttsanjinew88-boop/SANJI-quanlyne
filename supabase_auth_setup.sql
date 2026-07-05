-- ============================================================
-- SETUP ĐĂNG NHẬP + PHÂN QUYỀN (chạy 1 lần trong SQL Editor)
-- Chạy SAU supabase_setup.sql
-- ============================================================

-- 1. Bảng hồ sơ người dùng: quyền theo tab
--    perms ví dụ: {"data":true,"ko":true,"shift":false,"rank":true,"bc":false}
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  is_admin boolean not null default false,
  perms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 2. Hàm kiểm tra admin (security definer để tránh đệ quy RLS)
create or replace function public.is_admin()
returns boolean language sql security definer stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where user_id = auth.uid()), false)
$$;

-- 3. Policies cho profiles
drop policy if exists "read_own_or_admin" on public.profiles;
create policy "read_own_or_admin" on public.profiles
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "admin_update" on public.profiles;
create policy "admin_update" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_insert" on public.profiles;
create policy "admin_insert" on public.profiles
  for insert with check (public.is_admin() or user_id = auth.uid());

-- 4. Trigger: tự tạo hồ sơ khi có tài khoản mới
--    Tài khoản 'ttsanji' tự động là ADMIN với đầy đủ quyền
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  uname text := split_part(new.email, '@', 1);
  adm boolean := (split_part(new.email, '@', 1) = 'ttsanji');
begin
  insert into public.profiles (user_id, username, is_admin, perms)
  values (
    new.id,
    uname,
    adm,
    case when adm
      then '{"data":true,"ko":true,"shift":true,"rank":true,"bc":true}'::jsonb
      else '{}'::jsonb
    end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. SIẾT LẠI bảo mật: chỉ người đã đăng nhập mới đọc/ghi được dữ liệu
drop policy if exists "test_anon_all_reports" on public.reports;
drop policy if exists "auth_all_reports" on public.reports;
create policy "auth_all_reports" on public.reports
  for all to authenticated using (true) with check (true);

drop policy if exists "test_anon_upload_originals" on storage.objects;
drop policy if exists "auth_upload_originals" on storage.objects;
create policy "auth_upload_originals" on storage.objects
  for insert to authenticated with check (bucket_id = 'originals');

drop policy if exists "test_anon_read_originals" on storage.objects;
drop policy if exists "auth_read_originals" on storage.objects;
create policy "auth_read_originals" on storage.objects
  for select to authenticated using (bucket_id = 'originals');
