-- ============================================================
-- BÁO CÁO OFF CHO NHÂN VIÊN + HOÀN TÁC PHÂN CA (chốt 08/09/2026)
-- Chạy MỘT LẦN: Supabase -> SQL Editor -> New query -> dán toàn bộ -> Run.
-- Kết quả đúng: "Success. No rows returned".
--
-- VẤN ĐỀ ĐANG SỬA
--   Giao diện cho nhân viên tự báo OFF (chỉ cần quyền XEM tab Phân Ca), nhưng RLS của
--   bảng reports đòi can_edit('shift') để ghi type='work'. Hậu quả: audit_log ghi được
--   (tab Lịch Sử có dòng) còn dữ liệu thì bị chặn -> F5 là mất sạch, mà giao diện vẫn
--   báo "✓ Đã ghi nhận".
--
-- CÁCH SỬA
--   KHÔNG nới RLS. Mở đúng MỘT cửa hẹp: hàm shift_off_report() chạy security definer,
--   chỉ biết làm một việc là thêm một báo cáo OFF. Nhân viên vẫn không ghi thẳng được
--   vào bảng reports, nên vẫn không sửa được ô phân công, điểm, hạn mức...
--
-- KÈM THEO: lịch sử hoàn tác Phân Ca (type='work_undo') — mọi thay đổi phân công đều
--   được chụp lại dạng văn bản nén (~1KB/mốc), Tổ Trưởng/ADMIN lùi/tiến tối đa 5 bước.
--
-- ⚠ KHÔNG đụng tới can_write_report(): lịch sử và dữ liệu work đều do hàm security
--   definer ghi (bỏ qua RLS), nên không phải khai lại hàm đó — tránh được cái bẫy
--   "khai lại là ghi đè toàn bộ, quên chép type cũ là gãy chức năng cũ".
-- ============================================================

-- ------------------------------------------------------------
-- 1) NÉN / GIẢI NÉN ẢNH CHỤP PHÂN CA
--    Mỗi nhân viên 1 dòng, mỗi ngày 1 KÝ TỰ:
--      D=DD  K=KM  H=HT  O=OFF  S=SN  V=HV  -=trống
--    "fkjade:DDKOHDD...".  ~1KB cho 25 người x 31 ngày.
--    Gặp mã lạ (thêm mã việc mới sau này) thì tự động cất nguyên JSON thô ở khoá 'raw'
--    -> không bao giờ mất dữ liệu vì bảng mã lỗi thời.
-- ------------------------------------------------------------
create or replace function public._wk_pack(p_data jsonb)
returns jsonb language plpgsql immutable
as $$
declare
  k text; v jsonb; s text; c text; d int; lines text[] := '{}';
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return jsonb_build_object('raw', coalesce(p_data, '{}'::jsonb));
  end if;
  for k, v in select key, value from jsonb_each(p_data) loop
    if k = '_reports' then continue; end if;
    if left(k,1) = '_' or jsonb_typeof(v) <> 'object' then
      return jsonb_build_object('raw', p_data);        -- khoá lạ -> cất nguyên bản
    end if;
    s := '';
    for d in 1..31 loop
      c := coalesce(v ->> d::text, '');
      s := s || case c
        when 'DD' then 'D' when 'KM' then 'K' when 'HT' then 'H'
        when 'OFF' then 'O' when 'SN' then 'S' when 'HV' then 'V'
        when '' then '-' else '?' end;
    end loop;
    if position('?' in s) > 0 then
      return jsonb_build_object('raw', p_data);        -- mã việc lạ -> cất nguyên bản
    end if;
    lines := lines || (k || ':' || s);
  end loop;
  return jsonb_build_object(
    'g', array_to_string(lines, E'\n'),
    'r', coalesce(p_data->'_reports', '[]'::jsonb));
end $$;

create or replace function public._wk_unpack(p_snap jsonb)
returns jsonb language plpgsql immutable
as $$
declare
  ln text; k text; s text; c text; d int; m jsonb; res jsonb := '{}'::jsonb;
begin
  if p_snap is null then return '{}'::jsonb; end if;
  if p_snap ? 'raw' then return p_snap->'raw'; end if;
  foreach ln in array string_to_array(coalesce(p_snap->>'g',''), E'\n') loop
    if ln = '' then continue; end if;
    k := split_part(ln, ':', 1);
    s := split_part(ln, ':', 2);
    m := '{}'::jsonb;
    for d in 1..length(s) loop
      c := substr(s, d, 1);
      if c <> '-' then
        m := m || jsonb_build_object(d::text, case c
          when 'D' then 'DD' when 'K' then 'KM' when 'H' then 'HT'
          when 'O' then 'OFF' when 'S' then 'SN' when 'V' then 'HV' end);
      end if;
    end loop;
    res := res || jsonb_build_object(k, m);
  end loop;
  return res || jsonb_build_object('_reports', coalesce(p_snap->'r', '[]'::jsonb));
end $$;

-- ------------------------------------------------------------
-- 2) GHI PHÂN CÔNG + ĐẨY MỘT MỐC VÀO LỊCH SỬ
--    Bất biến: snaps[cur] LUÔN bằng dữ liệu đang sống. Nhờ vậy lùi/tiến chỉ là dời con
--    trỏ, không đẻ mốc mới — đó là điều kiện để còn đường "làm lại".
--    ⚠ Hàm này KHÔNG kiểm quyền và KHÔNG phải security definer: nó chỉ chạy được khi
--      được gọi từ trong các hàm definer bên dưới (đã kiểm quyền). Gọi thẳng từ client
--      sẽ bị RLS của bảng reports chặn.
-- ------------------------------------------------------------
create or replace function public._wk_commit(p_month text, p_data jsonb, p_what text, p_by text)
returns void language plpgsql
set search_path = public
as $$
declare
  v_old jsonb; v_hist jsonb; v_snaps jsonb; v_cur int;
  c_back constant int := 5;   -- SỐ BƯỚC LÙI TỐI ĐA (đổi ở đây là đổi cả tiến lẫn lùi)
begin
  select data into v_old  from reports where type = 'work'      and month = p_month;
  select data into v_hist from reports where type = 'work_undo' and month = p_month;

  if v_hist is null or jsonb_typeof(v_hist->'snaps') <> 'array'
     or jsonb_array_length(v_hist->'snaps') = 0 then
    -- Lần đầu của tháng: gieo mốc "trạng thái trước thay đổi này" để còn đường lùi.
    v_snaps := jsonb_build_array(
      jsonb_build_object('at', now(), 'by', p_by, 'what', 'Trạng thái ban đầu')
      || public._wk_pack(coalesce(v_old, '{}'::jsonb)));
    v_cur := 0;
  else
    v_snaps := v_hist->'snaps';
    v_cur   := coalesce((v_hist->>'cur')::int, jsonb_array_length(v_snaps) - 1);
    -- Đang đứng giữa lịch sử mà có thay đổi mới -> nhánh TIẾN bị cắt (quy tắc chuẩn).
    if v_cur < jsonb_array_length(v_snaps) - 1 then
      select coalesce(jsonb_agg(e order by i), '[]'::jsonb) into v_snaps
        from jsonb_array_elements(v_snaps) with ordinality t(e, i)
       where i - 1 <= v_cur;
    end if;
  end if;

  v_snaps := v_snaps || jsonb_build_array(
    jsonb_build_object('at', now(), 'by', p_by, 'what', left(coalesce(p_what,'?'), 200))
    || public._wk_pack(p_data));
  v_cur := jsonb_array_length(v_snaps) - 1;

  -- Giữ tối đa c_back mốc phía TRƯỚC con trỏ (mốc cũ hơn tự rụng).
  if v_cur > c_back then
    select coalesce(jsonb_agg(e order by i), '[]'::jsonb) into v_snaps
      from jsonb_array_elements(v_snaps) with ordinality t(e, i)
     where i - 1 >= v_cur - c_back;
    v_cur := c_back;
  end if;

  insert into reports(type, month, data, updated_at)
    values ('work', p_month, p_data, now())
    on conflict (type, month) do update set data = excluded.data, updated_at = now();

  insert into reports(type, month, data, updated_at)
    values ('work_undo', p_month, jsonb_build_object('cur', v_cur, 'snaps', v_snaps), now())
    on conflict (type, month) do update set data = excluded.data, updated_at = now();
end $$;

-- ------------------------------------------------------------
-- 3) TỔ TRƯỞNG / ADMIN LƯU PHÂN CÔNG (thay cho ghi thẳng vào bảng)
--    Cùng đường đi với báo cáo OFF nên MỌI thay đổi đều có mốc hoàn tác.
-- ------------------------------------------------------------
create or replace function public.work_save(p_month text, p_data jsonb, p_what text)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare v_by text;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập'; end if;
  if not public.can_edit('shift') then raise exception 'Bạn không có quyền sửa Phân Ca'; end if;
  if p_month !~ '^\d{4}-\d{2}$' then raise exception 'Tháng không hợp lệ'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Dữ liệu không hợp lệ'; end if;
  select username into v_by from profiles where user_id = auth.uid();
  perform public._wk_commit(p_month, p_data,
    coalesce(nullif(btrim(p_what), ''), 'Cập nhật phân công'), coalesce(v_by, '?'));
  return p_data;
end $$;

-- ------------------------------------------------------------
-- 4) LÙI / TIẾN MỘT BƯỚC (p_dir = -1 hoàn tác, +1 làm lại)
--    Chỉ chép lại ảnh chụp đã lưu — KHÔNG chạy lại thuật toán phân công (thuật toán có
--    bước xáo ngẫu nhiên, chạy lại sẽ ra lưới khác, tức là không hoàn tác được gì).
-- ------------------------------------------------------------
create or replace function public.work_undo_step(p_month text, p_dir int)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare v_hist jsonb; v_snaps jsonb; v_cur int; v_new int; v_data jsonb; v_by text; v_what text;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập'; end if;
  if not public.can_edit('shift') then raise exception 'Chỉ Tổ Trưởng / ADMIN được hoàn tác phân công'; end if;
  if p_dir not in (-1, 1) then raise exception 'Hướng không hợp lệ'; end if;

  select data into v_hist from reports where type = 'work_undo' and month = p_month for update;
  if v_hist is null or jsonb_typeof(v_hist->'snaps') <> 'array' then
    raise exception 'Tháng này chưa có lịch sử phân công';
  end if;
  v_snaps := v_hist->'snaps';
  v_cur   := coalesce((v_hist->>'cur')::int, jsonb_array_length(v_snaps) - 1);
  v_new   := v_cur + p_dir;
  if v_new < 0 then raise exception 'Đã ở mốc cũ nhất còn lưu — không lùi thêm được'; end if;
  if v_new > jsonb_array_length(v_snaps) - 1 then raise exception 'Đã ở mốc mới nhất — không làm lại thêm được'; end if;

  v_data := public._wk_unpack(v_snaps -> v_new);
  insert into reports(type, month, data, updated_at)
    values ('work', p_month, v_data, now())
    on conflict (type, month) do update set data = excluded.data, updated_at = now();
  update reports set data = jsonb_set(v_hist, '{cur}', to_jsonb(v_new)), updated_at = now()
   where type = 'work_undo' and month = p_month;

  select username into v_by from profiles where user_id = auth.uid();
  v_what := coalesce(v_snaps -> v_new ->> 'what', '?');
  insert into audit_log(user_id, username, action, detail)
    values (auth.uid(), coalesce(v_by, '?'),
      case when p_dir < 0 then 'Hoàn tác phân công' else 'Làm lại phân công' end,
      'Tháng ' || p_month || ' · về mốc: ' || v_what);
  return v_data;
end $$;

-- ------------------------------------------------------------
-- 5) NHÂN VIÊN BÁO CÁO OFF — CỬA DUY NHẤT ĐƯỢC MỞ
--    p_grid = lưới ĐÃ CÂN BẰNG do máy nhân viên tính (giữ MỘT bản thuật toán ở client).
--    Server KHÔNG tin lưới đó: đối chiếu với lưới đang có trên cloud và chỉ nhận khi
--    thay đổi đúng khuôn của một lần cân bằng sau báo OFF.
-- ------------------------------------------------------------
create or replace function public.shift_off_report(
  p_month text, p_fk text, p_type text, p_day int,
  p_to int default null, p_grid jsonb default null, p_name text default null)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_by text; v_lead boolean; v_from int; v_off_day int;
  v_old jsonb; v_new jsonb; v_grid jsonb; v_assign jsonb; v_ov jsonb; v_rep jsonb;
  k text; d int; o text; n text; v_what text; v_nm text;
begin
  -- --- kiểm đầu vào (không tin gì từ client) ---
  if v_uid is null then raise exception 'Chưa đăng nhập'; end if;
  if p_month !~ '^\d{4}-\d{2}$'  then raise exception 'Tháng không hợp lệ'; end if;
  if p_fk    !~ '^fk[a-z0-9_]+$' then raise exception 'Mã nhân viên không hợp lệ'; end if;
  if p_type not in ('half','full','move') then raise exception 'Loại báo cáo không hợp lệ'; end if;
  if p_day is null or p_day < 1 or p_day > 31 then raise exception 'Ngày không hợp lệ'; end if;
  if p_type = 'move' and (p_to is null or p_to < 1 or p_to > 31 or p_to = p_day) then
    raise exception 'Ngày chuyển tới không hợp lệ';
  end if;

  select username into v_by from profiles where user_id = v_uid;
  v_by    := coalesce(v_by, '?');
  v_nm    := coalesce(nullif(btrim(coalesce(p_name,'')), ''), p_fk);
  v_lead  := public.can_edit('shift');
  v_off_day := coalesce(case when p_type = 'move' then p_to end, p_day);
  v_from  := least(p_day, v_off_day);   -- ngày sớm nhất mà lưới được phép đổi

  select data into v_old from reports where type = 'work' and month = p_month for update;
  v_old := coalesce(v_old, '{}'::jsonb);

  -- --- chặn báo trùng: cùng người + cùng ngày + cùng loại ---
  if exists (select 1 from jsonb_array_elements(coalesce(v_old->'_reports','[]'::jsonb)) e
              where e->>'fk' = p_fk and e->>'type' = p_type
                and coalesce(e->>'day','') = p_day::text) then
    raise exception 'Đã có báo cáo cùng loại cho % ngày % — không báo trùng', v_nm, p_day;
  end if;

  -- --- 1) đặt ô OFF: SERVER tự làm, không lấy từ client ---
  v_new := v_old;
  if p_type <> 'half' then
    if p_type = 'move' then
      if coalesce(v_new -> p_fk ->> p_day::text, '') <> 'OFF' then
        raise exception '% không OFF vào ngày % — kiểm tra lại', v_nm, p_day;
      end if;
      if coalesce(v_new -> p_fk ->> p_to::text, '') = 'OFF' then
        raise exception 'Ngày % đã là ngày OFF sẵn', p_to;
      end if;
      v_new := v_new #- array[p_fk, p_day::text];
    end if;
    if v_new -> p_fk is null or jsonb_typeof(v_new -> p_fk) <> 'object' then
      v_new := v_new || jsonb_build_object(p_fk, '{}'::jsonb);
    end if;
    v_new := jsonb_set(v_new, array[p_fk, v_off_day::text], '"OFF"'::jsonb, true);
  end if;

  -- --- 2) lưới đã cân bằng do client gửi lên ---
  if p_type <> 'half' and p_grid is not null and jsonb_typeof(p_grid) = 'object' then
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_grid
      from jsonb_each(p_grid)
     where left(key,1) <> '_' and jsonb_typeof(value) = 'object';

    if not v_lead then
      -- Nhân viên: soi từng ô. Bố cục ngày nghỉ và quá khứ là BẤT KHẢ XÂM PHẠM.
      select data->'assign' into v_assign from reports where type = 'shift' and month = p_month;
      select data           into v_ov     from reports where type = 'ov'    and month = p_month;
      for k in
        select key from jsonb_object_keys(v_new) key where left(key,1) <> '_'
        union
        select key from jsonb_object_keys(v_grid) key
      loop
        for d in 1..31 loop
          o := v_new  -> k ->> d::text;
          n := v_grid -> k ->> d::text;
          continue when o is not distinct from n;
          if d < v_from then
            raise exception 'Không được đổi phân công ngày % (trước ngày báo OFF)', d;
          end if;
          if coalesce(o,'') in ('OFF','SN','HV') or coalesce(n,'') in ('OFF','SN','HV') then
            raise exception 'Không được thêm / xoá / dời ngày nghỉ (% ngày %)', k, d;
          end if;
          if n is null then
            -- bỏ trống ô: chỉ chấp nhận với người không thuộc ca nào hoặc đang Học Việc
            if coalesce(v_assign ->> k, '') <> ''
               and coalesce(v_ov -> k ->> 'khac', '') <> 'Học Việc' then
              raise exception 'Không được bỏ trống phân công (% ngày %)', k, d;
            end if;
          elsif n not in ('DD','KM','HT') then
            raise exception 'Giá trị phân công không hợp lệ: %', n;
          end if;
        end loop;
      end loop;
    end if;

    v_new := v_grid || jsonb_build_object('_reports', coalesce(v_new->'_reports', '[]'::jsonb));
    -- đặt lại ô OFF LẦN NỮA sau khi ghép lưới (không tin client, và idempotent)
    if v_new -> p_fk is null or jsonb_typeof(v_new -> p_fk) <> 'object' then
      v_new := v_new || jsonb_build_object(p_fk, '{}'::jsonb);
    end if;
    if p_type = 'move' then v_new := v_new #- array[p_fk, p_day::text]; end if;
    v_new := jsonb_set(v_new, array[p_fk, v_off_day::text], '"OFF"'::jsonb, true);
  end if;

  -- --- 3) nối bản ghi báo cáo (server tự dựng: 'by' lấy từ auth, không giả mạo được) ---
  v_rep := jsonb_build_object(
    'fk', p_fk, 'type', p_type, 'day', p_day,
    'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'by', v_by);
  if p_type = 'move' then v_rep := v_rep || jsonb_build_object('to', p_to); end if;
  v_new := jsonb_set(v_new, '{_reports}',
    coalesce(v_new->'_reports', '[]'::jsonb) || jsonb_build_array(v_rep), true);

  -- --- 4) ghi + mốc hoàn tác + lịch sử thao tác, TẤT CẢ trong một transaction ---
  v_what := case p_type when 'half' then 'Báo cáo OFF 0.5 ngày'
                        when 'full' then 'Báo cáo OFF 1 ngày'
                        else 'Chuyển ngày OFF' end
            || ' — ' || v_nm || ' ngày ' || p_day
            || coalesce(' → ' || p_to::text, '');
  perform public._wk_commit(p_month, v_new, v_what, v_by);
  insert into audit_log(user_id, username, action, detail)
    values (v_uid, v_by,
      case when p_type = 'move' then 'Chuyển ngày OFF' else 'Báo cáo OFF đột xuất' end,
      v_what || ' · tháng ' || p_month || ' · bởi ' || v_by);
  return v_new;
end $$;

-- ------------------------------------------------------------
-- 6) QUYỀN GỌI
--    Chỉ 3 hàm "cửa trước" được mở cho tài khoản đăng nhập. Các hàm phụ (_wk_*) không
--    mở cho ai — chúng chỉ chạy từ bên trong 3 hàm trên.
-- ------------------------------------------------------------
revoke all on function public._wk_pack(jsonb)   from public;
revoke all on function public._wk_unpack(jsonb) from public;
revoke all on function public._wk_commit(text, jsonb, text, text) from public;

revoke all on function public.work_save(text, jsonb, text)   from public;
revoke all on function public.work_undo_step(text, int)      from public;
revoke all on function public.shift_off_report(text, text, text, int, int, jsonb, text) from public;

grant execute on function public.work_save(text, jsonb, text)  to authenticated;
grant execute on function public.work_undo_step(text, int)     to authenticated;
grant execute on function public.shift_off_report(text, text, text, int, int, jsonb, text) to authenticated;

-- ============================================================
-- KIỂM NHANH SAU KHI CHẠY (tùy chọn, dán riêng):
--   select public._wk_unpack(public._wk_pack(
--     '{"fkabc":{"1":"DD","2":"OFF"},"_reports":[{"fk":"fkabc"}]}'::jsonb));
--   -> phải trả về đúng JSON ban đầu.
-- ============================================================
