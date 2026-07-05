-- ============================================================
-- UPDATE 2: LỊCH SỬ THAO TÁC + ĐỔI MẬT KHẨU THEO CẤP BẬC
-- Chạy 1 lần trong SQL Editor (sau 2 file SQL trước)
-- ============================================================

create extension if not exists pgcrypto;

-- 1. Hàm lấy cấp bậc của người đang gọi: 'admin' | 'totruong' | 'nhanvien'
create or replace function public.my_role()
returns text language sql security definer stable
set search_path = public
as $$
  select case
    when is_admin then 'admin'
    when coalesce(perms->>'_role','nhanvien') = 'totruong' then 'totruong'
    else 'nhanvien'
  end
  from public.profiles where user_id = auth.uid()
$$;

-- 2. Tổ Trưởng cũng được xem danh sách tài khoản (để đổi mật khẩu nhân viên)
drop policy if exists "read_own_or_admin" on public.profiles;
drop policy if exists "read_own_or_manager" on public.profiles;
create policy "read_own_or_manager" on public.profiles
  for select using (user_id = auth.uid() or public.my_role() in ('admin','totruong'));

-- 3. Đổi mật khẩu theo cấp bậc:
--    - Ai cũng tự đổi được mật khẩu của mình
--    - ADMIN đổi được của tất cả
--    - Tổ Trưởng chỉ đổi được của Nhân viên (KHÔNG đổi được của ADMIN hay Tổ Trưởng khác)
create or replace function public.change_password(target_id uuid, new_password text)
returns text language plpgsql security definer
set search_path = public, extensions
as $$
declare
  caller text := public.my_role();
  t_admin boolean;
  t_role text;
begin
  if new_password is null or length(new_password) < 6 then
    raise exception 'Mật khẩu tối thiểu 6 ký tự';
  end if;
  select is_admin, coalesce(perms->>'_role','nhanvien')
    into t_admin, t_role
    from public.profiles where user_id = target_id;
  if not found then
    raise exception 'Không tìm thấy tài khoản';
  end if;
  if target_id = auth.uid() then
    null; -- tự đổi mật khẩu của mình: luôn cho phép
  elsif caller = 'admin' then
    null; -- admin đổi được tất cả
  elsif caller = 'totruong' and (not t_admin) and t_role = 'nhanvien' then
    null; -- tổ trưởng đổi được nhân viên
  else
    raise exception 'Bạn không có quyền đổi mật khẩu tài khoản này';
  end if;
  update auth.users
    set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf'))
    where id = target_id;
  return 'ok';
end $$;

-- 4. Bảng lịch sử thao tác
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  username text,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

drop policy if exists "log_insert" on public.audit_log;
create policy "log_insert" on public.audit_log
  for insert to authenticated with check (true);

drop policy if exists "log_select" on public.audit_log;
create policy "log_select" on public.audit_log
  for select to authenticated using (true);
