-- ============================================================
-- UPDATE 3: WHITE IP + KHÓA TÀI KHOẢN (đăng nhập sai 5 lần)
-- Chạy 1 lần trong SQL Editor (sau các file SQL trước)
-- ============================================================

-- 1. Bảng an ninh đăng nhập
create table if not exists public.login_security (
  username text primary key,
  fails int not null default 0,
  locked boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.login_security enable row level security;

drop policy if exists "sec_select_auth" on public.login_security;
create policy "sec_select_auth" on public.login_security
  for select to authenticated using (true);

-- 2. RPC: ghi nhận đăng nhập sai (gọi được khi CHƯA đăng nhập)
--    Sai >= 5 lần -> tự khóa tài khoản
create or replace function public.login_fail(uname text)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare f int; l boolean;
begin
  uname := lower(trim(uname));
  if uname = '' or length(uname) > 30 then return jsonb_build_object('fails',0,'locked',false); end if;
  insert into public.login_security(username, fails, locked)
  values (uname, 1, false)
  on conflict (username) do update
    set fails = login_security.fails + 1,
        locked = (login_security.fails + 1 >= 5) or login_security.locked,
        updated_at = now();
  select fails, locked into f, l from public.login_security where username = uname;
  return jsonb_build_object('fails', f, 'locked', l);
end $$;

-- 3. RPC: kiểm tra tài khoản có bị khóa không (gọi được khi CHƯA đăng nhập)
create or replace function public.is_locked(uname text)
returns boolean language sql security definer stable
set search_path = public
as $$
  select coalesce((select locked from public.login_security where username = lower(trim(uname))), false)
$$;

-- 4. RPC: đăng nhập thành công -> xóa đếm sai
create or replace function public.login_ok(uname text)
returns void language sql security definer
set search_path = public
as $$
  update public.login_security set fails = 0, updated_at = now() where username = lower(trim(uname))
$$;

-- 5. RPC: khóa / mở khóa thủ công — chỉ ADMIN và Tổ Trưởng
create or replace function public.set_lock(uname text, val boolean)
returns text language plpgsql security definer
set search_path = public
as $$
declare
  caller text := public.my_role();
  t_admin boolean;
  t_role text;
begin
  if caller not in ('admin','totruong') then
    raise exception 'Chỉ ADMIN hoặc Tổ Trưởng mới được khóa/mở khóa tài khoản';
  end if;
  select is_admin, coalesce(perms->>'_role','nhanvien')
    into t_admin, t_role
    from public.profiles where username = lower(trim(uname));
  if caller = 'totruong' and (coalesce(t_admin,false) or t_role = 'totruong') then
    raise exception 'Tổ Trưởng chỉ khóa/mở khóa được tài khoản Nhân viên';
  end if;
  insert into public.login_security(username, fails, locked)
  values (lower(trim(uname)), 0, val)
  on conflict (username) do update set locked = val, fails = case when val then login_security.fails else 0 end, updated_at = now();
  return 'ok';
end $$;

-- 6. RPC: đọc danh sách White IP (gọi được khi CHƯA đăng nhập — màn hình login cần)
--    Danh sách lưu trong bảng reports: type='whiteip', month='all', data={"list":[...]}
create or replace function public.get_whiteip()
returns jsonb language sql security definer stable
set search_path = public
as $$
  select coalesce((select data->'list' from public.reports where type = 'whiteip' and month = 'all'), '[]'::jsonb)
$$;
