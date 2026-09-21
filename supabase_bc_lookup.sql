-- ============================================================
--  BÁO CÁO ĐẠI LÝ (T2) — BỎ PHÂN CÔNG, NHÂN VIÊN TRA CỨU MỌI ĐẠI LÝ   (21/09/2026)
--
--  Chạy SAU supabase_bc_assign.sql + supabase_bc_marks_nv.sql. Chạy lại nhiều lần vô hại.
--  CHẠY Ở ĐÂU: Supabase -> SQL Editor -> dán toàn bộ file này -> Run.
--
--  THAY ĐỔI NGHIỆP VỤ (user chốt 21/09/2026):
--    · GỠ tab "Phân Công Check Đại Lý" — không còn giao đại lý cho từng nhân viên.
--    · Nhân viên nào cũng KIỂM TRA ĐƯỢC MỌI ĐẠI LÝ.
--    · Nhưng giao diện nhân viên KHÔNG bày sẵn cả kho: bảng trống, chỉ hiện sau khi
--      gõ tên đại lý (hoặc tên tài khoản / họ tên / ngân hàng) vào ô tìm kiếm.
--
--  ⛔ VÌ SAO VẪN PHẢI LÀM Ở MÁY CHỦ (giữ nguyên chốt chặn 17/09/2026):
--    repo public + anon key public. Nếu mở lại quyền đọc thẳng reports type='bc' rồi chỉ
--    "không vẽ" ở JS thì toàn bộ khách (họ tên · STK · IP) của MỌI đại lý vẫn nằm trong
--    trình duyệt — F12 -> Network là thấy hết. Nay nhân viên đi qua bc_lookup(): máy chủ
--    lọc TRƯỚC khi gửi, mỗi lượt chỉ trả về phần khớp từ khoá, có TRẦN số đại lý/số dòng.
--    Thẻ tổng lấy qua bc_totals() — chỉ có CON SỐ TỔNG, không có một dòng khách nào.
--
--  GIỮ NGUYÊN, KHÔNG SỬA Ở FILE NÀY:
--    · policy reports_select (supabase_bc_assign.sql) vẫn khoá đọc thẳng
--      bc / bc_marks / bc_assign / suspects với nhân viên.
--    · can_write_report() KHÔNG khai lại (khai lại là GHI ĐÈ TOÀN BỘ — bẫy đã ghi trong
--      CLAUDE.md). Quyền ghi của Tổ Trưởng giữ như cũ.
-- ============================================================

-- ------------------------------------------------------------
-- 1) bc_my_view() — cửa cũ lọc theo phân công. Không còn ai gọi (bảng phân công đã gỡ)
--    nên XOÁ HẲN: để lại một hàm security definer không dùng là để lại một cửa không ai canh.
-- ------------------------------------------------------------
drop function if exists public.bc_my_view();

-- ------------------------------------------------------------
-- 2) bc_lookup(p_q) — CỬA TRA CỨU CỦA NHÂN VIÊN
--    p_q = đúng chuỗi người dùng gõ ở ô tìm kiếm tab Tổng Hợp. Hai chế độ, khớp y hệt
--    bản lọc tại máy của ADMIN/Tổ Trưởng (BC.filterAll) để hai bên cho cùng kết quả:
--      · NHIỀU từ khoá (ngăn bằng , ; tab hoặc xuống dòng) -> khớp ĐÚNG TÊN đại lý,
--        dán bao nhiêu hiện bấy nhiêu; tên không thấy trả về ở MISS.
--      · MỘT từ khoá -> khớp CHỨA trên đại lý / tên tài khoản / họ tên / ngân hàng.
--        Bắt buộc ≥ 3 ký tự (gõ 1 ký tự là gần như quét cả kho).
--    TRẦN: tối đa 60 đại lý + 3.000 dòng mỗi lượt; vượt thì cắt và trả capped=true.
--    Trả về: ROWS · AGENTS (dòng tổng của đúng các đại lý đó) · MARKS (ô đã tô) ·
--            DONE (đại lý đã nằm trong Nghi Ngờ -> nhãn "Đã Xử Lý") · MISS · capped · MAX_MONTH.
-- ------------------------------------------------------------
create or replace function public.bc_lookup(p_q text)
returns jsonb language plpgsql stable security definer
set search_path = public
as $$
declare
  v_perm text; v_parts text[]; v_multi boolean; v_q text;
  v_bc jsonb; v_marks jsonb; v_sus jsonb;
  v_rows jsonb; v_ags text[]; v_capped boolean := false;
  c_max_rows constant int := 3000;
  c_max_ags  constant int := 60;
  c_min_len  constant int := 3;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập'; end if;
  select coalesce(perms->>'bc','') into v_perm
    from public.profiles where user_id = auth.uid();
  if public.my_role() not in ('admin','totruong') and v_perm not in ('view','edit') then
    raise exception 'Không có quyền xem báo cáo đại lý';
  end if;

  select coalesce(array_agg(t), '{}'::text[]) into v_parts
    from (select btrim(x) as t
            from regexp_split_to_table(lower(coalesce(p_q,'')), '[,;\n\r\t]+') as x) s
   where t <> '';
  v_multi := coalesce(array_length(v_parts, 1), 0) > 1;

  -- Chưa gõ gì / gõ quá ngắn -> trả rỗng kèm lý do, KHÔNG đọc dữ liệu
  if coalesce(array_length(v_parts, 1), 0) = 0
     or (not v_multi and char_length(v_parts[1]) < c_min_len) then
    return jsonb_build_object(
      'ROWS', '[]'::jsonb, 'AGENTS', '[]'::jsonb, 'MARKS', '{}'::jsonb,
      'DONE', '[]'::jsonb, 'MISS', '[]'::jsonb,
      'capped', false, 'too_short', coalesce(array_length(v_parts, 1), 0) > 0,
      'min_len', c_min_len, 'MAX_MONTH', '');
  end if;
  v_q := v_parts[1];

  select data into v_bc    from public.reports where type = 'bc'       and month = 'current';
  select data into v_marks from public.reports where type = 'bc_marks' and month = 'current';
  select data into v_sus   from public.reports where type = 'suspects' and month = 'all';

  /* position() thay cho LIKE: người dùng gõ '%' hay '_' cũng chỉ là ký tự thường,
     không phải ký tự đại diện -> không có đường quét cả kho bằng một dấu %. */
  with e as (
    select t.v, t.i
      from jsonb_array_elements(coalesce(v_bc->'ROWS', '[]'::jsonb)) with ordinality as t(v, i)
  ), m as (
    select v, i, lower(btrim(coalesce(v->>'dai_ly',''))) as ag
      from e
     where case when v_multi
                then lower(btrim(coalesce(v->>'dai_ly',''))) = any(v_parts)
                else position(v_q in lower(coalesce(v->>'dai_ly',    ''))) > 0
                  or position(v_q in lower(coalesce(v->>'id',        ''))) > 0
                  or position(v_q in lower(coalesce(v->>'ho_ten',    ''))) > 0
                  or position(v_q in lower(coalesce(v->>'ngan_hang', ''))) > 0
           end
  ), keep as (                           -- cắt theo ĐẠI LÝ trước, để không trả nửa đại lý
    select ag from (select ag, min(i) as mi from m group by ag order by mi limit c_max_ags) z
  ), sel as (
    select v, i, ag from m where ag in (select ag from keep) order by i limit c_max_rows
  )
  select coalesce((select jsonb_agg(v order by i) from sel), '[]'::jsonb),
         coalesce((select array_agg(distinct ag) from sel), '{}'::text[]),
         (select count(*) from m) > (select count(*) from sel)
    into v_rows, v_ags, v_capped;

  return jsonb_build_object(
    'ROWS', v_rows,
    'AGENTS', coalesce((
      select jsonb_agg(e.v order by e.i)
        from jsonb_array_elements(coalesce(v_bc->'AGENTS', '[]'::jsonb)) with ordinality as e(v, i)
       where lower(btrim(coalesce(e.v->>'dai_ly',''))) = any(v_ags)), '[]'::jsonb),
    'MARKS', coalesce((
      select jsonb_object_agg(k.key, k.value)
        from jsonb_each(coalesce(v_marks->'marks', '{}'::jsonb)) k
       where lower(btrim(k.key)) = any(v_ags)), '{}'::jsonb),
    'DONE', coalesce((
      select jsonb_agg(distinct x->>'dai_ly')
        from jsonb_array_elements(coalesce(v_sus->'list', '[]'::jsonb)) x
       where x ? 'dai_ly' and lower(btrim(x->>'dai_ly')) = any(v_ags)), '[]'::jsonb),
    'MISS', case when v_multi then coalesce((
        select jsonb_agg(p) from unnest(v_parts) as p where not (p = any(v_ags))), '[]'::jsonb)
      else '[]'::jsonb end,
    'capped', v_capped, 'too_short', false, 'min_len', c_min_len,
    'MAX_MONTH', coalesce(v_bc->>'MAX_MONTH', ''));
end
$$;

revoke all on function public.bc_lookup(text) from public;
grant execute on function public.bc_lookup(text) to authenticated;

-- ------------------------------------------------------------
-- 3) bc_totals() — THẺ TỔNG cho nhân viên: CHỈ CON SỐ, không kèm dòng khách nào.
--    Cùng quy tắc với BC.qualifiedRows ở máy khách: KH hợp lệ (hop_le) thuộc đại lý có
--    ≥ 3 KH hợp lệ -> con số trên thẻ giống hệt thứ ADMIN/Tổ Trưởng đang thấy.
-- ------------------------------------------------------------
create or replace function public.bc_totals()
returns jsonb language plpgsql stable security definer
set search_path = public
as $$
declare
  v_perm text; v_bc jsonb; v_qa text[];
  v_rows bigint; v_moi bigint; v_nap numeric; v_rut numeric; v_cuoc numeric;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập'; end if;
  select coalesce(perms->>'bc','') into v_perm
    from public.profiles where user_id = auth.uid();
  if public.my_role() not in ('admin','totruong') and v_perm not in ('view','edit') then
    raise exception 'Không có quyền xem báo cáo đại lý';
  end if;

  select data into v_bc from public.reports where type = 'bc' and month = 'current';

  select coalesce(array_agg(lower(btrim(coalesce(a->>'dai_ly','')))), '{}'::text[])
    into v_qa
    from jsonb_array_elements(coalesce(v_bc->'AGENTS', '[]'::jsonb)) a
   where coalesce(nullif(a->>'khach_hop_le','')::numeric, 0) >= 3;

  select count(*),
         count(*) filter (where r->>'khach' = 'Mới'),
         coalesce(sum(coalesce(nullif(r->>'tien_nap',    '')::numeric, 0)), 0),
         coalesce(sum(coalesce(nullif(r->>'tien_rut',    '')::numeric, 0)), 0),
         coalesce(sum(coalesce(nullif(r->>'cuoc_hop_le','')::numeric, 0)), 0)
    into v_rows, v_moi, v_nap, v_rut, v_cuoc
    from jsonb_array_elements(coalesce(v_bc->'ROWS', '[]'::jsonb)) r
   where coalesce(nullif(r->>'hop_le','')::boolean, false)
     and lower(btrim(coalesce(r->>'dai_ly',''))) = any(v_qa);

  return jsonb_build_object(
    'agents',     coalesce(array_length(v_qa, 1), 0),
    'rows',       v_rows, 'moi', v_moi,
    'nap',        v_nap,  'rut', v_rut, 'cuoc', v_cuoc,
    'total_rows',   jsonb_array_length(coalesce(v_bc->'ROWS',   '[]'::jsonb)),
    'total_agents', jsonb_array_length(coalesce(v_bc->'AGENTS', '[]'::jsonb)),
    'MAX_MONTH', coalesce(v_bc->>'MAX_MONTH', ''),
    'at', v_bc->>'at', 'by', v_bc->>'by');
end
$$;

revoke all on function public.bc_totals() from public;
grant execute on function public.bc_totals() to authenticated;

-- ------------------------------------------------------------
-- 4) bc_mark_set() — BỎ điều kiện "đại lý phải nằm trong phân công".
--    Khai lại NGUYÊN VĂN bản ở supabase_bc_marks_nv.sql, chỉ bỏ khối tra bc_assign.
--    Vẫn giữ: chỉ thay ĐÚNG một đại lý trong 1 câu UPDATE -> nhiều người tô cùng lúc
--    không ghi đè ô của nhau; vẫn chặn người không có quyền xem báo cáo đại lý.
-- ------------------------------------------------------------
create or replace function public.bc_mark_set(p_agent text, p_cells jsonb)
returns void language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_perm text;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập'; end if;
  if p_agent is null or btrim(p_agent) = '' then raise exception 'Thiếu tên đại lý'; end if;
  if p_cells is null or jsonb_typeof(p_cells) <> 'array' then raise exception 'Dữ liệu ô không hợp lệ'; end if;
  if jsonb_array_length(p_cells) > 5000 then raise exception 'Quá nhiều ô'; end if;

  select coalesce(perms->>'bc','') into v_perm
    from public.profiles where user_id = auth.uid();
  if public.my_role() not in ('admin','totruong') and v_perm not in ('view','edit') then
    raise exception 'Không có quyền xem báo cáo đại lý';
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
-- 5) Bảng phân công cũ: KHÔNG tự xoá dòng dữ liệu (để còn xem lại nếu cần).
--    Muốn dọn hẳn thì chạy tay:
--      delete from public.reports where type = 'bc_assign';
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 6) KIỂM TRA SAU KHI CHẠY — đăng nhập tài khoản NHÂN VIÊN, F12 -> Console:
--   (await SB.client().from('reports').select('type').in('type',['bc','suspects'])).data
--     -> [] (vẫn không đọc thẳng được)
--   (await SB.client().rpc('bc_lookup',{p_q:'ab'})).data.too_short          -> true  (quá ngắn)
--   (await SB.client().rpc('bc_lookup',{p_q:'<tên đại lý>'})).data.ROWS.length
--     -> đúng số khách của đại lý đó (BẤT KỲ đại lý nào, không cần phân công)
--   (await SB.client().rpc('bc_totals')).data                               -> chỉ các con số tổng
--   (await SB.client().rpc('bc_my_view')).error                             -> có lỗi (hàm đã xoá)
--
-- GỠ BỎ (quay lại phân công): chạy lại supabase_bc_assign.sql + supabase_bc_marks_nv.sql,
--   rồi drop function public.bc_lookup(text), public.bc_totals();
-- ============================================================
