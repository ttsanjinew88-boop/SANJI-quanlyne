-- ============================================================
--  BÁO CÁO ĐẠI LÝ (T2) — PHÂN CÔNG CHECK ĐẠI LÝ   (17/09/2026)
--
--  Nhân viên CHỈ được xem đại lý được giao cho tài khoản của mình.
--  Chạy SAU supabase_bc_cloud.sql. Chạy lại nhiều lần vô hại.
--  CHẠY Ở ĐÂU: Supabase -> SQL Editor -> dán toàn bộ file này -> Run.
--
--  ⛔ VÌ SAO PHẢI LÀM Ở MÁY CHỦ, KHÔNG CHỈ ẨN TRÊN GIAO DIỆN:
--    repo để công khai + anon key công khai. Trước file này, policy reports_select
--    cho MỌI tài khoản đăng nhập đọc thẳng bảng reports -> nhân viên mở F12 gõ 1 dòng
--    là lấy được toàn bộ khách (họ tên · STK · IP) của MỌI đại lý, kể cả bản Nghi Ngờ.
--    Nay: 4 loại dưới đây CHỈ ADMIN + Tổ Trưởng đọc thẳng được; nhân viên đi qua hàm
--    bc_my_view() — máy chủ lọc TRƯỚC khi gửi, dữ liệu đại lý khác không rời máy chủ.
--      bc        bản tính toán dùng chung (month='current')
--      bc_marks  ô đã tô ở Kiểm Tra Đại Lý (month='current')
--      bc_assign bảng phân công {list:[{dai_ly,user}]} (month='all')  -- MỚI
--      suspects  danh sách Nghi Ngờ (month='all')
-- ============================================================

-- ------------------------------------------------------------
-- 1) QUYỀN GHI: thêm 'bc_assign' (bảng phân công) và 'suspects' cho Tổ Trưởng.
--    'suspects': Tổ Trưởng vốn được tô ô trong tab Nghi Ngờ nhưng máy chủ trước đây chỉ
--    cho ADMIN ghi loại này -> tô ô bị từ chối. Nay Tổ Trưởng dùng đủ chức năng tab đó.
--
-- ⚠ BẪY: khai lại can_write_report() là GHI ĐÈ TOÀN BỘ. Đã chép ĐỦ mọi type đang chạy
--   (bản gần nhất: supabase_bc_cloud.sql). Thêm type mới sau này phải chép đủ y như vậy.
-- ------------------------------------------------------------
create or replace function public.can_write_report(t text)
returns boolean language sql security definer stable
set search_path = public
as $$
  select case
    when public.is_admin() then true                                   -- ADMIN: toàn quyền
    when t in ('sop_index','sop_item','tgremind','warnkw') then public.my_role() = 'totruong'
    when t in ('bc','bc_marks','bc_assign','suspects') then public.my_role() = 'totruong'  -- báo cáo đại lý
    when t in ('don','km')            then public.can_edit('data') or public.can_edit('ko')
    when t in ('shift','work')        then public.can_edit('shift')
    when t in ('anomaly','limits','ov') then public.can_edit('ko')
    when t = 'rids'                   then auth.uid() is not null       -- đánh dấu rid đã dùng
    else false
  end
$$;

-- ------------------------------------------------------------
-- 2) QUYỀN ĐỌC: mọi loại khác GIỮ NGUYÊN như cũ (ai đăng nhập cũng đọc được);
--    riêng 4 loại của báo cáo đại lý chỉ ADMIN + Tổ Trưởng đọc thẳng.
--    (Ghi cũng cần đọc được dòng cũ — upsert — nên người ghi 4 loại này đều là ADMIN/TT: khớp.)
-- ------------------------------------------------------------
drop policy if exists "reports_select" on public.reports;
create policy "reports_select" on public.reports
  for select to authenticated
  using (
    type not in ('bc','bc_marks','bc_assign','suspects')
    or public.my_role() in ('admin','totruong')
  );

-- ------------------------------------------------------------
-- 3) CỬA DUY NHẤT CHO NHÂN VIÊN: bc_my_view()
--    Tự biết ai đang gọi (auth.uid() -> profiles.username), tra bảng phân công, trả về
--    ĐÚNG phần của các đại lý được giao. So tên không phân biệt hoa/thường, bỏ khoảng trắng.
--    Trả về:
--      ROWS / AGENTS  chỉ khách + dòng tổng của đại lý được giao (giữ nguyên thứ tự)
--      MARKS          ô đã tô của các đại lý đó
--      DONE           tên các đại lý được giao đã nằm trong Nghi Ngờ (nhãn "Đã Xử Lý")
--      ASSIGNED       danh sách đại lý được giao (kể cả đại lý không có trong bản hiện tại)
--      MAX_MONTH / at / by
-- ------------------------------------------------------------
create or replace function public.bc_my_view()
returns jsonb language plpgsql stable security definer
set search_path = public
as $$
declare
  v_user text; v_perm text; v_ags text[];
  v_bc jsonb; v_marks jsonb; v_assign jsonb; v_sus jsonb;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập'; end if;

  select lower(trim(username)), coalesce(perms->>'bc','')
    into v_user, v_perm
    from public.profiles where user_id = auth.uid();
  if v_user is null then raise exception 'Không tìm thấy tài khoản'; end if;
  if public.my_role() not in ('admin','totruong') and v_perm not in ('view','edit') then
    raise exception 'Không có quyền xem báo cáo đại lý';
  end if;

  select data into v_assign from public.reports where type = 'bc_assign' and month = 'all';
  select coalesce(array_agg(distinct lower(trim(x->>'dai_ly'))), '{}'::text[])
    into v_ags
    from jsonb_array_elements(coalesce(v_assign->'list', '[]'::jsonb)) x
   where lower(trim(x->>'user')) = v_user
     and coalesce(trim(x->>'dai_ly'), '') <> '';

  select data into v_bc    from public.reports where type = 'bc'       and month = 'current';
  select data into v_marks from public.reports where type = 'bc_marks' and month = 'current';
  select data into v_sus   from public.reports where type = 'suspects' and month = 'all';

  return jsonb_build_object(
    'ROWS', coalesce((
      select jsonb_agg(e.v order by e.i)
        from jsonb_array_elements(coalesce(v_bc->'ROWS', '[]'::jsonb)) with ordinality as e(v, i)
       where lower(trim(e.v->>'dai_ly')) = any(v_ags)), '[]'::jsonb),
    'AGENTS', coalesce((
      select jsonb_agg(e.v order by e.i)
        from jsonb_array_elements(coalesce(v_bc->'AGENTS', '[]'::jsonb)) with ordinality as e(v, i)
       where lower(trim(e.v->>'dai_ly')) = any(v_ags)), '[]'::jsonb),
    'MARKS', coalesce((
      select jsonb_object_agg(k.key, k.value)
        from jsonb_each(coalesce(v_marks->'marks', '{}'::jsonb)) k
       where lower(trim(k.key)) = any(v_ags)), '{}'::jsonb),
    'DONE', coalesce((
      select jsonb_agg(distinct x->>'dai_ly')
        from jsonb_array_elements(coalesce(v_sus->'list', '[]'::jsonb)) x
       where x ? 'dai_ly' and lower(trim(x->>'dai_ly')) = any(v_ags)), '[]'::jsonb),
    'ASSIGNED', coalesce((
      select jsonb_agg(distinct trim(x->>'dai_ly'))
        from jsonb_array_elements(coalesce(v_assign->'list', '[]'::jsonb)) x
       where lower(trim(x->>'user')) = v_user
         and coalesce(trim(x->>'dai_ly'), '') <> ''), '[]'::jsonb),
    'MAX_MONTH', coalesce(v_bc->>'MAX_MONTH', ''),
    'at', v_bc->>'at',
    'by', v_bc->>'by'
  );
end
$$;

revoke all on function public.bc_my_view() from public;
grant execute on function public.bc_my_view() to authenticated;

-- ------------------------------------------------------------
-- 4) KIỂM TRA SAU KHI CHẠY
--  a) Đăng nhập tài khoản NHÂN VIÊN trên dashboard, mở F12 -> Console, gõ:
--       (await SB.client().from('reports').select('type').in('type',['bc','suspects'])).data
--     phải ra [] (mảng rỗng) — nhân viên KHÔNG đọc thẳng được nữa.
--       (await SB.client().rpc('bc_my_view')).data.ROWS.length
--     phải ra đúng số khách của các đại lý được giao cho tài khoản đó.
--  b) Trong SQL Editor:
--       select type, month from public.reports where type in ('bc','bc_marks','bc_assign','suspects');
--
-- GỠ BỎ (quay lại như trước): tạo lại policy reports_select với using (true),
--   drop function public.bc_my_view(); và khai lại can_write_report bỏ 'bc_assign','suspects'.
-- ============================================================
