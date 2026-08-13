-- ============================================================
-- GỘP ĐIỂM BẤT THƯỜNG BỊ LẠC MÃ  (Supabase -> SQL Editor -> New query -> dán -> Run)
--
-- Bối cảnh: trước bản vá 11/08/2026, dashboard gửi báo cáo Telegram bằng mã ghép từ
-- TÊN hiển thị ('fk'+tên) thay vì key roster. Khi CHAMY đổi tên thành SOLIS (05/08/2026),
-- Edge Function cộng điểm vào mã 'fksolis', trong khi bảng Hiệu Suất Bất Thường đọc theo
-- key thật 'fkchamy' => điểm vẫn nằm trong DB nhưng không hiển thị và không tính thưởng/phạt.
--
-- Script này CỘNG DỒN theo từng ngày dữ liệu của mã lạc vào key thật rồi XÓA mã lạc,
-- áp cho MỌI tháng có report 'anomaly', cả 2 nhóm 'abuse' (cược lạm dụng) và 'mkt' (đại lý ngoài).
--
-- BƯỚC 1: chạy phần KIỂM TRA để xem sẽ gộp những gì (không thay đổi dữ liệu).
-- BƯỚC 2: chạy phần GỘP.
-- BƯỚC 3: F5 dashboard, mở tab Hiệu Suất KO -> Bất Thường, kiểm tra dòng SOLIS.
-- ============================================================

-- ---------- BƯỚC 1: KIỂM TRA (chạy riêng, an toàn) ----------
select month,
       cat,
       data -> cat -> 'fksolis' as diem_dang_bi_lac,
       data -> cat -> 'fkchamy' as diem_dang_hien_thi
from public.reports, unnest(array['abuse','mkt']) as cat
where type = 'anomaly'
  and (data -> cat) ? 'fksolis'
order by month, cat;


-- ---------- BƯỚC 2: GỘP fksolis -> fkchamy ----------
do $$
declare
  v_src text := 'fksolis';   -- mã lạc (sinh ra từ tên mới)
  v_dst text := 'fkchamy';   -- key thật trong ROSTER (giữ nguyên khi đổi tên)
  r        record;
  d        jsonb;
  cat      text;
  src_map  jsonb;
  dst_map  jsonb;
  merged   jsonb;
  k        text;
  n_month  int := 0;
begin
  for r in select id, month, data from public.reports where type = 'anomaly' loop
    d := r.data;

    foreach cat in array array['abuse','mkt'] loop
      src_map := coalesce(d -> cat -> v_src, '{}'::jsonb);
      continue when src_map = '{}'::jsonb;

      dst_map := coalesce(d -> cat -> v_dst, '{}'::jsonb);
      merged  := dst_map;

      -- cộng dồn theo từng NGÀY
      for k in select jsonb_object_keys(src_map) loop
        merged := jsonb_set(
          merged,
          array[k],
          to_jsonb( coalesce((dst_map ->> k)::numeric, 0) + coalesce((src_map ->> k)::numeric, 0) ),
          true
        );
      end loop;

      d := jsonb_set(d, array[cat, v_dst], merged, true);   -- ghi vào key thật
      d := d #- array[cat, v_src];                          -- xóa mã lạc

      raise notice 'Thang % · % : da gop % ngay tu % vao %',
        r.month, cat, (select count(*) from jsonb_object_keys(src_map)), v_src, v_dst;
    end loop;

    if d is distinct from r.data then
      update public.reports set data = d, updated_at = now() where id = r.id;
      n_month := n_month + 1;
    end if;
  end loop;

  raise notice 'XONG. So thang da cap nhat: %', n_month;
end $$;


-- ---------- BƯỚC 3: KIỂM TRA LẠI (phải KHÔNG còn dòng nào) ----------
select month, cat, data -> cat -> 'fksolis' as con_sot_lai
from public.reports, unnest(array['abuse','mkt']) as cat
where type = 'anomaly'
  and (data -> cat) ? 'fksolis';
