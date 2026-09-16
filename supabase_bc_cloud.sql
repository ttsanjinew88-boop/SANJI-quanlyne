-- ============================================================
--  BÁO CÁO ĐẠI LÝ (T2) — BẢN DÙNG CHUNG TRÊN CLOUD   (16/09/2026)
--
--  Từ nay kết quả bấm "Tính toán" KHÔNG còn nằm trong RAM của một máy nữa mà lưu
--  thành ĐÚNG MỘT bản dùng chung, ai đăng nhập cũng thấy:
--      reports type='bc'        month='current'  -> {ROWS, AGENTS, MAX_MONTH, at, by}
--      reports type='bc_marks'  month='current'  -> {marks:{đại lý:["dòng|cột",...]}}
--  Nút "Xóa Dữ Liệu" GHI BẢN RỖNG vào 2 dòng trên (không xoá dòng) — dùng đúng đường
--  GHI nên Tổ Trưởng làm được, khỏi phải nới policy XOÁ (policy đó dùng chung cho MỌI
--  loại dữ liệu: điểm nhân viên, phân ca, hạn mức...).
--
--  CHẠY Ở ĐÂU: Supabase -> SQL Editor -> dán toàn bộ file này -> Run.
--  Chạy lại nhiều lần vô hại.
--
--  ⚠ KHÔNG chạy file này thì Tổ Trưởng bấm "Tính toán" sẽ bị máy chủ TỪ CHỐI ghi
--    (ADMIN vẫn ghi được vì is_admin() đi nhánh true).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Cho phép ADMIN + Tổ Trưởng ghi 2 loại 'bc' và 'bc_marks'
--
-- ⚠ BẪY: khai lại can_write_report() là GHI ĐÈ TOÀN BỘ hàm cũ. Danh sách dưới đây đã
--   chép ĐỦ mọi type đang chạy (bản gần nhất là supabase_warnkw_setup.sql), chỉ thêm
--   'bc','bc_marks'. Sau này thêm type mới thì lại phải chép đủ y như vậy.
-- ------------------------------------------------------------
create or replace function public.can_write_report(t text)
returns boolean language sql security definer stable
set search_path = public
as $$
  select case
    when public.is_admin() then true                                   -- ADMIN: toàn quyền
    when t in ('sop_index','sop_item','tgremind','warnkw') then public.my_role() = 'totruong'
    when t in ('bc','bc_marks')       then public.my_role() = 'totruong'  -- MỚI: báo cáo đại lý dùng chung
    when t in ('don','km')            then public.can_edit('data') or public.can_edit('ko')
    when t in ('shift','work')        then public.can_edit('shift')
    when t in ('anomaly','limits','ov') then public.can_edit('ko')
    when t = 'rids'                   then auth.uid() is not null       -- đánh dấu rid đã dùng
    else false
  end
$$;

-- ------------------------------------------------------------
-- 2) KIỂM TRA SAU KHI CHẠY (đăng nhập bằng tài khoản Tổ Trưởng rồi chạy)
--    select public.can_write_report('bc');        -- phải ra true
--    select public.can_write_report('bc_marks');  -- phải ra true
--    select public.can_write_report('suspects');  -- vẫn false (chỉ ADMIN) — đúng
--
--    Xem bản dùng chung đang có gì:
--    select type, month, jsonb_array_length(data->'ROWS') as so_kh, data->>'by' as nguoi_tinh,
--           data->>'at' as luc, updated_at
--      from public.reports where type in ('bc','bc_marks');
--
-- GỠ BỎ (quay lại chỉ ADMIN ghi được): khai lại hàm trên, bỏ đúng dòng có 'bc','bc_marks'.
-- ============================================================
