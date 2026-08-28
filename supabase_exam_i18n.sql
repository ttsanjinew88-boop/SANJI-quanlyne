-- =====================================================================
--  T5 — KIỂM TRA NGHIỆP VỤ · SONG NGỮ VI/EN cho NỘI DUNG ĐỀ
--  Chạy SAU supabase_exam_setup.sql và supabase_exam_storage.sql.
--  Dán toàn bộ file này vào SQL Editor của Supabase rồi bấm Run. Chạy lại
--  nhiều lần cũng không sao (add column if not exists + create or replace).
--
--  Cơ chế giống hệt tab Quy Trình Làm Việc (T4):
--    • Bản tiếng Việt nằm ở cột gốc (question, answer, name, image_url).
--    • Bản tiếng Anh nằm ở cột en_* — THIẾU thì giao diện tự rơi về tiếng Việt.
--    • Cột envi_* lưu DẤU VẾT bản tiếng Việt tại thời điểm dịch, dùng để đánh
--      dấu "bản dịch đã cũ" khi người soạn sửa lại câu tiếng Việt.
--    • Ảnh: mỗi câu hỏi có thể có ảnh riêng cho bản EN (en_image_url).
--
--  ⚠ Bài ĐÃ NỘP giữ bản chụp riêng trong exam_answers -> thêm cột en_* ở đó
--    luôn, để bài cũ mở lại vẫn xem được cả 2 ngôn ngữ.
-- =====================================================================

-- ---------------- 1. Thêm cột ----------------
alter table public.exam_topics
  add column if not exists en_name   text,
  add column if not exists envi_name text;

alter table public.exam_questions
  add column if not exists en_question   text,
  add column if not exists en_answer     text,
  add column if not exists en_image_url  text,
  add column if not exists envi_question text,
  add column if not exists envi_answer   text;

alter table public.exam_answers
  add column if not exists en_topic_name    text,
  add column if not exists en_question      text,
  add column if not exists en_image_url     text,
  add column if not exists en_sample_answer text;

-- ---------------- 2. Nạp dữ liệu mở tab (thêm tên chủ đề bản EN) ----------------
create or replace function public.exam_boot()
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tt  boolean := public.my_role() in ('admin','totruong');
  v_dur int;
  m     public.exam_members%rowtype;
  p     public.exam_submissions%rowtype;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập'; end if;

  insert into public.exam_members(user_id) values (v_uid) on conflict do nothing;
  select * into m from public.exam_members where user_id = v_uid;
  select coalesce(value::int, 45) into v_dur from public.exam_settings where key = 'duration';

  select * into p from public.exam_submissions
   where user_id = v_uid and status = 'doing'
   order by started_at desc limit 1;

  return jsonb_build_object(
    'topics', coalesce((select jsonb_agg(jsonb_build_object(
                          'id', id, 'name', name, 'color', color,
                          'en_name', coalesce(en_name, ''), 'envi_name', coalesce(envi_name, ''))
                          order by name)
                          from public.exam_topics), '[]'::jsonb),
    'config', coalesce((select jsonb_object_agg(topic_id::text, count) from public.exam_config), '{}'::jsonb),
    'settings', jsonb_build_object(
        'duration', v_dur,
        'show_answer', coalesce((select value from public.exam_settings where key = 'show_answer'), 'no') = 'yes'),
    'me', jsonb_build_object(
        'remaining', m.remaining, 'used', m.used, 'exam_cfg', m.exam_cfg, 'can_edit', v_tt),
    'pending', case when p.id is null then null else jsonb_build_object(
        'code', p.code, 'count', p.q_count,
        'elapsed', floor(extract(epoch from (now() - p.started_at)))::int) end
  );
end $$;

-- ---------------- 3. Bắt đầu / làm tiếp bài (chụp cả bản EN vào đề) ----------------
-- Lượt bị trừ NGAY khi bắt đầu (chống bấm lại nhiều lần để đổi đề), nhưng đề được
-- lưu lại nên F5 / mất mạng / đóng tab vào lại nhận ĐÚNG đề cũ và KHÔNG trừ thêm.
create or replace function public.exam_start()
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_dur int;
  v_cfg jsonb;
  v_qs  jsonb;
  m     public.exam_members%rowtype;
  p     public.exam_submissions%rowtype;
  v_name text;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập'; end if;
  select coalesce(value::int, 45) into v_dur from public.exam_settings where key = 'duration';

  -- Bài đang làm dở còn hạn -> trả lại nguyên đề, không trừ lượt
  select * into p from public.exam_submissions
   where user_id = v_uid and status = 'doing'
   order by started_at desc limit 1;
  if p.id is not null then
    if now() - p.started_at < make_interval(mins => v_dur + 30) then
      return jsonb_build_object(
        'resumed', true, 'id', p.id, 'code', p.code, 'duration', v_dur,
        'elapsed', floor(extract(epoch from (now() - p.started_at)))::int,
        'questions', (select coalesce(jsonb_agg(jsonb_build_object(
             'topic', q->>'topic', 'question', q->>'question', 'image_url', q->>'image_url',
             'en_topic', coalesce(q->>'en_topic', ''), 'en_question', coalesce(q->>'en_question', ''),
             'en_image_url', coalesce(q->>'en_image_url', ''))
             order by ord), '[]'::jsonb)
           from jsonb_array_elements(p.questions) with ordinality t(q, ord)),
        'remaining', (select remaining from public.exam_members where user_id = v_uid));
    end if;
    update public.exam_submissions set status = 'abandoned' where id = p.id;  -- bỏ quá lâu
  end if;

  insert into public.exam_members(user_id) values (v_uid) on conflict do nothing;
  select * into m from public.exam_members where user_id = v_uid for update;
  if m.remaining <= 0 then
    raise exception 'Bạn đã hết lượt làm bài. Liên hệ Tổ Trưởng để được cấp thêm.';
  end if;

  -- Đề riêng nếu có, không thì đề chung
  v_cfg := coalesce(m.exam_cfg,
    (select jsonb_object_agg(topic_id::text, count) from public.exam_config where count > 0), '{}'::jsonb);

  -- Bốc NGẪU NHIÊN theo từng chủ đề rồi trộn thứ tự — làm ở SERVER để nhân viên
  -- không tự chọn được câu dễ. Chụp luôn bản EN để bài cũ vẫn xem được 2 thứ tiếng
  -- kể cả khi sau này câu hỏi gốc bị sửa hoặc xoá.
  select coalesce(jsonb_agg(x order by random()), '[]'::jsonb) into v_qs
    from jsonb_each_text(v_cfg) c(tid, cnt)
    cross join lateral (
      select jsonb_build_object(
               'topic', t.name,                     'en_topic',     coalesce(t.en_name, ''),
               'question', q.question,              'en_question',  coalesce(q.en_question, ''),
               'image_url', coalesce(q.image_url, ''), 'en_image_url', coalesce(q.en_image_url, ''),
               'answer', coalesce(q.answer, ''),    'en_answer',    coalesce(q.en_answer, '')) as x
        from public.exam_questions q
        join public.exam_topics t on t.id = q.topic_id
       where q.topic_id = c.tid::uuid and q.active
       order by random()
       limit (c.cnt)::int
    ) s;

  if jsonb_array_length(v_qs) = 0 then
    raise exception 'Chưa có câu hỏi được cấu hình. Nhờ Tổ Trưởng thiết lập đề.';
  end if;

  select username into v_name from public.profiles where user_id = v_uid;
  insert into public.exam_submissions(code, user_id, username, questions, q_count)
    values (public.exam_code(), v_uid, v_name, v_qs, jsonb_array_length(v_qs))
    returning * into p;
  update public.exam_members set remaining = remaining - 1, used = used + 1 where user_id = v_uid;

  return jsonb_build_object(
    'resumed', false, 'id', p.id, 'code', p.code, 'duration', v_dur, 'elapsed', 0,
    'questions', (select coalesce(jsonb_agg(jsonb_build_object(
         'topic', q->>'topic', 'question', q->>'question', 'image_url', q->>'image_url',
         'en_topic', coalesce(q->>'en_topic', ''), 'en_question', coalesce(q->>'en_question', ''),
         'en_image_url', coalesce(q->>'en_image_url', ''))
         order by ord), '[]'::jsonb)
       from jsonb_array_elements(v_qs) with ordinality t(q, ord)),
    'remaining', m.remaining - 1);
end $$;

-- ---------------- 4. Nộp bài (lưu kèm bản EN đã chụp) ----------------
create or replace function public.exam_submit(p_id uuid, p_answers jsonb, p_duration int)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  p     public.exam_submissions%rowtype;
begin
  select * into p from public.exam_submissions
   where id = p_id and user_id = v_uid and status = 'doing';
  if p.id is null then raise exception 'Không tìm thấy bài đang làm (có thể đã nộp rồi).'; end if;

  insert into public.exam_answers(submission_id, idx, topic_name, question, image_url, sample_answer, reply,
                                  en_topic_name, en_question, en_image_url, en_sample_answer)
  select p.id, (ord - 1)::int, q->>'topic', q->>'question', q->>'image_url', q->>'answer',
         coalesce(p_answers->>((ord - 1)::int), ''),
         q->>'en_topic', q->>'en_question', q->>'en_image_url', q->>'en_answer'
    from jsonb_array_elements(p.questions) with ordinality t(q, ord);

  update public.exam_submissions
     set status = 'done', submitted_at = now(), duration_sec = greatest(1, coalesce(p_duration, 0)),
         month = public.exam_month(now())
   where id = p.id;

  return jsonb_build_object('code', p.code, 'count', p.q_count);
end $$;

-- ---------------- 5. Bài của chính mình (trả kèm bản EN) ----------------
-- Đáp án mẫu chỉ kèm theo khi cài đặt show_answer bật (hoặc người xem là Tổ Trưởng).
create or replace function public.exam_my_list()
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_show boolean;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập'; end if;
  v_show := public.my_role() in ('admin','totruong')
         or coalesce((select value from public.exam_settings where key = 'show_answer'), 'no') = 'yes';

  return jsonb_build_object('show_answer', v_show, 'submissions', coalesce((
    select jsonb_agg(jsonb_build_object(
             'code', s.code, 'time', s.submitted_at, 'duration_sec', s.duration_sec,
             'count', s.q_count, 'total', s.total, 'graded', s.graded,
             'items', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'topic', a.topic_name, 'question', a.question, 'image_url', a.image_url,
                        'en_topic', coalesce(a.en_topic_name, ''), 'en_question', coalesce(a.en_question, ''),
                        'en_image_url', coalesce(a.en_image_url, ''),
                        'reply', a.reply, 'answer', case when v_show then a.sample_answer else '' end,
                        'en_answer', case when v_show then coalesce(a.en_sample_answer, '') else '' end,
                        'score', a.score, 'note', a.note) order by a.idx)
                 from public.exam_answers a where a.submission_id = s.id), '[]'::jsonb))
           order by s.submitted_at desc)
      from public.exam_submissions s
     where s.user_id = v_uid and s.status = 'done'), '[]'::jsonb));
end $$;

-- Xong. Không cần deploy Edge Function nào cho tab này.
