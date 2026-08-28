-- ============================================================
-- KIỂM TRA NGHIỆP VỤ (T5) — CẬP NHẬT 1: XÓA BÀI ĐÃ NỘP
-- Chạy 1 lần trong Supabase -> SQL Editor -> New query -> dán -> Run.
-- Chạy SAU `supabase_exam_setup.sql`.
--
-- Dùng khi cần dọn bài test thử, bài nộp nhầm, hoặc bài của tài khoản đã nghỉ.
-- Xóa bài thì các câu trả lời trong exam_answers tự xóa theo (on delete cascade),
-- và bài đó biến mất khỏi bảng xếp hạng luôn.
--
-- ⚠ KHÔNG hoàn lượt test đã trừ: lượt bị trừ lúc BẮT ĐẦU làm bài, xóa bài là
-- việc dọn dữ liệu chứ không phải hủy lượt. Muốn cấp lại thì vào tab Quản Lý
-- Nhân Viên gõ số lượt mới.
-- ============================================================

create or replace function public.exam_delete(p_id uuid)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare v_code text; v_user text;
begin
  if public.my_role() not in ('admin','totruong') then
    raise exception 'Chức năng này chỉ dành cho Tổ Trưởng trở lên.';
  end if;

  select code, username into v_code, v_user from public.exam_submissions where id = p_id;
  if v_code is null then raise exception 'Không tìm thấy bài này (có thể đã bị xóa rồi).'; end if;

  delete from public.exam_submissions where id = p_id;   -- exam_answers xóa theo cascade
  return jsonb_build_object('code', v_code, 'username', v_user);
end $$;

revoke all on function public.exam_delete(uuid) from public, anon;
grant execute on function public.exam_delete(uuid) to authenticated;
