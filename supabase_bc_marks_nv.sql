-- ============================================================
--  BÁO CÁO ĐẠI LÝ (T2) — NHÂN VIÊN TÔ Ô NGHI NGỜ   (17/09/2026)
--
--  Chạy SAU supabase_bc_assign.sql. Chạy lại nhiều lần vô hại.
--  CHẠY Ở ĐÂU: Supabase -> SQL Editor -> dán toàn bộ file này -> Run.
--
--  Ô đã tô ở Kiểm Tra Đại Lý lưu chung: reports type='bc_marks' month='current'
--  = {marks:{"tên đại lý":["dòng|cột",...]}}. Nhân viên KHÔNG có quyền ghi thẳng loại này
--  (RLS), nên đi qua hàm bc_mark_set():
--    · Nhân viên chỉ ghi được ô của ĐẠI LÝ ĐƯỢC GIAO (tra bảng bc_assign theo tài khoản).
--    · ADMIN + Tổ Trưởng ghi được mọi đại lý.
--    · Chỉ thay ĐÚNG một đại lý, ngay trong 1 câu UPDATE trên máy chủ -> 2 người tô 2 đại lý
--      cùng lúc không ghi đè mất ô của nhau (bản cũ gửi CẢ bộ ô từ máy khách lên).
--  Không cần khai lại can_write_report (hàm security definer tự ghi, bỏ qua RLS).
-- ============================================================

create or replace function public.bc_mark_set(p_agent text, p_cells jsonb)
returns void language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_user text; v_ok boolean;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập'; end if;
  if p_agent is null or trim(p_agent) = '' then raise exception 'Thiếu tên đại lý'; end if;
  if p_cells is null or jsonb_typeof(p_cells) <> 'array' then raise exception 'Dữ liệu ô không hợp lệ'; end if;
  if jsonb_array_length(p_cells) > 5000 then raise exception 'Quá nhiều ô'; end if;

  if public.my_role() not in ('admin','totruong') then
    select lower(trim(username)) into v_user from public.profiles where user_id = auth.uid();
    select exists(
      select 1
        from public.reports r,
             jsonb_array_elements(coalesce(r.data->'list', '[]'::jsonb)) x
       where r.type = 'bc_assign' and r.month = 'all'
         and lower(trim(x->>'user'))   = v_user
         and lower(trim(x->>'dai_ly')) = lower(trim(p_agent))
    ) into v_ok;
    if not coalesce(v_ok, false) then
      raise exception 'Đại lý này không nằm trong phân công của bạn';
    end if;
  end if;

  insert into public.reports(type, month, data, updated_at)
  values ('bc_marks', 'current',
          jsonb_build_object('marks',
            case when jsonb_array_length(p_cells) = 0 then '{}'::jsonb
                 else jsonb_build_object(p_agent, p_cells) end),
          now())
  on conflict (type, month) do update
     set data = jsonb_set(
                  coalesce(public.reports.data, '{}'::jsonb), '{marks}',
                  case when jsonb_array_length(p_cells) = 0
                       then coalesce(public.reports.data->'marks', '{}'::jsonb) - p_agent
                       else coalesce(public.reports.data->'marks', '{}'::jsonb) || jsonb_build_object(p_agent, p_cells)
                  end, true),
         updated_at = now();
end
$$;

revoke all on function public.bc_mark_set(text, jsonb) from public;
grant execute on function public.bc_mark_set(text, jsonb) to authenticated;

-- ------------------------------------------------------------
-- KIỂM TRA: đăng nhập NHÂN VIÊN, F12 -> Console:
--   (await SB.client().rpc('bc_mark_set',{p_agent:'<đại lý được giao>',p_cells:['0|tien_nap']})).error
--     -> null (ghi được)
--   (await SB.client().rpc('bc_mark_set',{p_agent:'<đại lý KHÔNG được giao>',p_cells:['0|tien_nap']})).error.message
--     -> "Đại lý này không nằm trong phân công của bạn"
-- GỠ BỎ: drop function public.bc_mark_set(text, jsonb);
-- ============================================================
