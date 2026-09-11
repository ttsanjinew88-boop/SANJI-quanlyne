-- =====================================================================
--  T5 — KIỂM TRA NGHIỆP VỤ · 2 CHẾ ĐỘ LÀM BÀI (chốt 12/09/2026)
--    1. Kiểm Tra Định Kỳ Tháng      (mode = 'monthly') — như cũ: bốc NGẪU NHIÊN
--       theo cấu trúc đề (số câu mỗi chủ đề), có đề riêng từng người.
--    2. Kiểm Tra Năng Lực Thực Tập  (mode = 'intern')  — đề ĐÚNG 50 câu do Tổ
--       Trưởng / ADMIN thiết lập từ ngân hàng câu hỏi. MỖI CHỦ ĐỀ chọn 1 trong 2:
--         • Cố định  — chọn tay từng câu; mọi người nhận đúng các câu đó, KHÔNG đảo.
--         • Ngẫu nhiên — chỉ đặt số câu; mỗi lượt hệ thống bốc câu bất kỳ và đảo.
--       Chưa đủ đúng 50 câu thì nhân viên KHÔNG bắt đầu được bài (server chặn).
--
--  Luật chung cho CẢ 2 chế độ: HẾT GIỜ = XEM NHƯ ĐÃ NỘP. Bài bỏ dở quá giờ không
--  còn bị "huỷ" nữa mà được nộp (kèm bản nháp trên máy nếu có) để Tổ Trưởng chấm.
--
--  Chạy SAU: supabase_exam_setup.sql → supabase_exam_storage.sql →
--            supabase_exam_i18n.sql (file này dùng các cột en_* của file đó).
--  Dán toàn bộ vào SQL Editor → Run. Chạy lại nhiều lần vô hại.
--
--  Bảo mật GIỮ NGUYÊN: nhân viên không đọc được bảng câu hỏi / đề thực tập —
--  đề vẫn do exam_start() dựng ở SERVER và cắt đáp án mẫu. Lượt test TÁCH RIÊNG
--  theo chế độ. Xếp hạng (tab Xếp Hạng của T1) CHỈ tính bài Định Kỳ Tháng.
-- =====================================================================

-- ---------------- 1. Cột + bảng mới ----------------
alter table public.exam_submissions
  add column if not exists mode text not null default 'monthly';
alter table public.exam_submissions drop constraint if exists exam_submissions_mode_chk;
alter table public.exam_submissions
  add constraint exam_submissions_mode_chk check (mode in ('monthly','intern'));

alter table public.exam_members
  add column if not exists intern_remaining int not null default 0,
  add column if not exists intern_used      int not null default 0;

-- Câu CỐ ĐỊNH của đề thực tập. Xoá câu hỏi / chủ đề thì tự rơi khỏi đề (cascade).
create table if not exists public.exam_intern_set (
  question_id uuid primary key references public.exam_questions(id) on delete cascade,
  ord         int  not null default 0,
  created_at  timestamptz not null default now()
);
-- Cách lấy câu của TỪNG chủ đề trong đề thực tập. Chủ đề chưa có dòng = 'fixed'.
-- 'random' dùng `count`; 'fixed' dùng các câu trong exam_intern_set.
create table if not exists public.exam_intern_topic (
  topic_id uuid primary key references public.exam_topics(id) on delete cascade,
  mode     text not null default 'fixed' check (mode in ('fixed','random')),
  count    int  not null default 0 check (count >= 0)
);

alter table public.exam_intern_set   enable row level security;
alter table public.exam_intern_topic enable row level security;
drop policy if exists exam_intern_set_tt on public.exam_intern_set;
create policy exam_intern_set_tt on public.exam_intern_set
  for all to authenticated
  using (public.my_role() in ('admin','totruong'))
  with check (public.my_role() in ('admin','totruong'));
drop policy if exists exam_intern_topic_tt on public.exam_intern_topic;
create policy exam_intern_topic_tt on public.exam_intern_topic
  for all to authenticated
  using (public.my_role() in ('admin','totruong'))
  with check (public.my_role() in ('admin','totruong'));

insert into public.exam_settings(key, value) values ('intern_duration', '90')
  on conflict (key) do nothing;

-- ---------------- 2. Hàm phụ ----------------
-- Thời gian làm bài (phút) theo chế độ
create or replace function public.exam_dur(p_mode text)
returns int language sql stable
set search_path = public
as $$
  select coalesce(
    (select nullif(value, '')::int from public.exam_settings
      where key = case when p_mode = 'intern' then 'intern_duration' else 'duration' end),
    case when p_mode = 'intern' then 90 else 45 end)
$$;

-- Số câu đề thực tập của từng chủ đề (cố định: số câu đã chọn còn tồn tại;
-- ngẫu nhiên: số đặt, không vượt số câu đang có). Chỉ gọi từ trong các RPC.
create or replace function public.exam_intern_counts()
returns table(topic_id uuid, n int) language sql stable
set search_path = public
as $$
  select t.id,
         case when coalesce(it.mode, 'fixed') = 'random'
              then least(coalesce(it.count, 0),
                         (select count(*) from public.exam_questions q where q.topic_id = t.id and q.active))::int
              else (select count(*) from public.exam_intern_set s
                      join public.exam_questions q on q.id = s.question_id and q.active
                     where q.topic_id = t.id)::int
         end
    from public.exam_topics t
    left join public.exam_intern_topic it on it.topic_id = t.id
$$;

-- Chốt 1 bài: chép đề + câu trả lời sang exam_answers, chuyển 'done'.
-- Dùng chung cho nộp bài bình thường và tự nộp khi hết giờ. KHÔNG kiểm quyền
-- (chỉ gọi từ exam_submit / exam_start) -> thu hồi quyền gọi trực tiếp bên dưới.
create or replace function public._exam_finalize(p_id uuid, p_answers jsonb, p_duration int, p_at timestamptz)
returns void language plpgsql
set search_path = public
as $$
declare p public.exam_submissions%rowtype;
begin
  select * into p from public.exam_submissions where id = p_id and status = 'doing' for update;
  if p.id is null then return; end if;

  insert into public.exam_answers(submission_id, idx, topic_name, question, image_url, sample_answer, reply,
                                  en_topic_name, en_question, en_image_url, en_sample_answer)
  select p.id, (ord - 1)::int, q->>'topic', q->>'question', q->>'image_url', q->>'answer',
         coalesce(p_answers->>((ord - 1)::int), ''),
         q->>'en_topic', q->>'en_question', q->>'en_image_url', q->>'en_answer'
    from jsonb_array_elements(p.questions) with ordinality t(q, ord);

  update public.exam_submissions
     set status = 'done', submitted_at = p_at, duration_sec = greatest(1, coalesce(p_duration, 0)),
         month = public.exam_month(p_at)
   where id = p.id;
end $$;

-- ---------------- 3. Nạp dữ liệu mở tab ----------------
-- pending.expired = bài dở ĐÃ HẾT GIỜ -> màn hình tự nộp bản nháp rồi nạp lại.
create or replace function public.exam_boot()
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_tt   boolean := public.my_role() in ('admin','totruong');
  v_pdur int;
  m      public.exam_members%rowtype;
  p      public.exam_submissions%rowtype;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập'; end if;

  insert into public.exam_members(user_id) values (v_uid) on conflict do nothing;
  select * into m from public.exam_members where user_id = v_uid;

  select * into p from public.exam_submissions
   where user_id = v_uid and status = 'doing'
   order by started_at desc limit 1;
  if p.id is not null then v_pdur := public.exam_dur(p.mode); end if;

  return jsonb_build_object(
    'topics', coalesce((select jsonb_agg(jsonb_build_object(
                          'id', id, 'name', name, 'color', color,
                          'en_name', coalesce(en_name, ''), 'envi_name', coalesce(envi_name, ''))
                          order by name)
                          from public.exam_topics), '[]'::jsonb),
    'config', coalesce((select jsonb_object_agg(topic_id::text, count) from public.exam_config), '{}'::jsonb),
    -- đề thực tập: chỉ số câu theo chủ đề (không lộ câu nào được chọn)
    'intern_cfg', coalesce((select jsonb_object_agg(c.topic_id::text, c.n)
                              from public.exam_intern_counts() c where c.n > 0), '{}'::jsonb),
    'intern_total', (select coalesce(sum(c.n), 0) from public.exam_intern_counts() c),
    'intern_n', 50,
    'settings', jsonb_build_object(
        'duration', public.exam_dur('monthly'),
        'intern_duration', public.exam_dur('intern'),
        'show_answer', coalesce((select value from public.exam_settings where key = 'show_answer'), 'no') = 'yes'),
    'me', jsonb_build_object(
        'remaining', m.remaining, 'used', m.used, 'exam_cfg', m.exam_cfg, 'can_edit', v_tt,
        'intern_remaining', m.intern_remaining, 'intern_used', m.intern_used),
    'pending', case when p.id is null then null else jsonb_build_object(
        'id', p.id, 'code', p.code, 'count', p.q_count, 'mode', p.mode, 'duration', v_pdur,
        'elapsed', floor(extract(epoch from (now() - p.started_at)))::int,
        'expired', now() - p.started_at >= make_interval(secs => v_pdur * 60 + 60)) end
  );
end $$;

-- ---------------- 4. Bắt đầu / làm tiếp bài (theo chế độ) ----------------
-- ⚠ Bỏ bản không tham số: để cả exam_start() lẫn exam_start(text default …) cùng
-- tồn tại thì lời gọi không đối số bị Postgres báo "không phân biệt được hàm".
drop function if exists public.exam_start();

create or replace function public.exam_start(p_mode text default 'monthly')
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_mode text := coalesce(nullif(p_mode, ''), 'monthly');
  v_dur  int;
  v_pdur int;
  v_cfg  jsonb;
  v_qs   jsonb;
  v_rem  int;
  m      public.exam_members%rowtype;
  p      public.exam_submissions%rowtype;
  v_name text;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập'; end if;
  if v_mode not in ('monthly','intern') then raise exception 'Chế độ làm bài không hợp lệ.'; end if;
  v_dur := public.exam_dur(v_mode);

  select * into p from public.exam_submissions
   where user_id = v_uid and status = 'doing'
   order by started_at desc limit 1;
  if p.id is not null then
    v_pdur := public.exam_dur(p.mode);
    if now() - p.started_at < make_interval(secs => v_pdur * 60 + 60) then
      -- còn giờ -> trả lại nguyên đề, không trừ lượt. Đang dở bài chế độ khác thì chặn.
      if p.mode <> v_mode then
        raise exception 'Bạn đang có một bài % làm dở — hoàn thành bài đó trước.',
          case when p.mode = 'intern' then 'Kiểm Tra Năng Lực Thực Tập' else 'Kiểm Tra Định Kỳ Tháng' end;
      end if;
      return jsonb_build_object(
        'resumed', true, 'id', p.id, 'code', p.code, 'duration', v_pdur, 'mode', p.mode,
        'elapsed', floor(extract(epoch from (now() - p.started_at)))::int,
        'questions', (select coalesce(jsonb_agg(jsonb_build_object(
             'topic', q->>'topic', 'question', q->>'question', 'image_url', q->>'image_url',
             'en_topic', coalesce(q->>'en_topic', ''), 'en_question', coalesce(q->>'en_question', ''),
             'en_image_url', coalesce(q->>'en_image_url', ''))
             order by ord), '[]'::jsonb)
           from jsonb_array_elements(p.questions) with ordinality t(q, ord)),
        'remaining', (select case when p.mode = 'intern' then intern_remaining else remaining end
                        from public.exam_members where user_id = v_uid));
    end if;
    -- HẾT GIỜ = XEM NHƯ ĐÃ NỘP. Lưới an toàn: bình thường màn hình đã tự nộp kèm
    -- bản nháp lúc mở tab; tới được đây nghĩa là không có nháp -> nộp bài trống.
    perform public._exam_finalize(p.id, null, v_pdur * 60, p.started_at + make_interval(secs => v_pdur * 60));
  end if;

  insert into public.exam_members(user_id) values (v_uid) on conflict do nothing;
  select * into m from public.exam_members where user_id = v_uid for update;
  v_rem := case when v_mode = 'intern' then m.intern_remaining else m.remaining end;
  if v_rem <= 0 then
    raise exception 'Bạn đã hết lượt làm bài. Liên hệ Tổ Trưởng để được cấp thêm.';
  end if;

  if v_mode = 'intern' then
    -- Gom theo chủ đề. Chủ đề CỐ ĐỊNH: đúng các câu đã chọn, theo thứ tự chọn.
    -- Chủ đề NGẪU NHIÊN: bốc `count` câu bất kỳ, thứ tự ngẫu nhiên.
    select coalesce(jsonb_agg(z.x order by z.tname, z.tid, z.rn), '[]'::jsonb) into v_qs
      from (
        select t.name as tname, t.id as tid,
               row_number() over (partition by t.id order by s.ord, q.created_at) as rn,
               jsonb_build_object(
                 'topic', t.name,                        'en_topic',     coalesce(t.en_name, ''),
                 'question', q.question,                 'en_question',  coalesce(q.en_question, ''),
                 'image_url', coalesce(q.image_url, ''), 'en_image_url', coalesce(q.en_image_url, ''),
                 'answer', coalesce(q.answer, ''),       'en_answer',    coalesce(q.en_answer, '')) as x
          from public.exam_intern_set s
          join public.exam_questions q on q.id = s.question_id and q.active
          join public.exam_topics t on t.id = q.topic_id
          left join public.exam_intern_topic it on it.topic_id = t.id
         where coalesce(it.mode, 'fixed') = 'fixed'
        union all
        select t.name, t.id, r.rn, r.x
          from public.exam_intern_topic it
          join public.exam_topics t on t.id = it.topic_id
          cross join lateral (
            select row_number() over (order by random()) as rn,
                   jsonb_build_object(
                     'topic', t.name,                         'en_topic',     coalesce(t.en_name, ''),
                     'question', rq.question,                 'en_question',  coalesce(rq.en_question, ''),
                     'image_url', coalesce(rq.image_url, ''), 'en_image_url', coalesce(rq.en_image_url, ''),
                     'answer', coalesce(rq.answer, ''),       'en_answer',    coalesce(rq.en_answer, '')) as x
              from (select * from public.exam_questions q
                     where q.topic_id = t.id and q.active
                     order by random() limit it.count) rq
          ) r
         where it.mode = 'random' and it.count > 0
      ) z;
    -- ĐỦ ĐÚNG 50 CÂU mới cho làm (đếm trên đề THẬT vừa dựng: câu bị xoá, chủ đề
    -- ngẫu nhiên không đủ câu… đều làm thiếu và bị chặn ở đây). Số 50 khớp EX.INTERN_N.
    if jsonb_array_length(v_qs) <> 50 then
      raise exception 'Đề Kiểm Tra Năng Lực Thực Tập chưa đủ 50 câu (hiện có % câu). Nhờ Tổ Trưởng hoàn tất đề.',
        jsonb_array_length(v_qs);
    end if;
  else
    -- Đề riêng nếu có, không thì đề chung — bốc NGẪU NHIÊN ở SERVER (như cũ)
    v_cfg := coalesce(m.exam_cfg,
      (select jsonb_object_agg(topic_id::text, count) from public.exam_config where count > 0), '{}'::jsonb);
    select coalesce(jsonb_agg(x order by random()), '[]'::jsonb) into v_qs
      from jsonb_each_text(v_cfg) c(tid, cnt)
      cross join lateral (
        select jsonb_build_object(
                 'topic', t.name,                        'en_topic',     coalesce(t.en_name, ''),
                 'question', q.question,                 'en_question',  coalesce(q.en_question, ''),
                 'image_url', coalesce(q.image_url, ''), 'en_image_url', coalesce(q.en_image_url, ''),
                 'answer', coalesce(q.answer, ''),       'en_answer',    coalesce(q.en_answer, '')) as x
          from public.exam_questions q
          join public.exam_topics t on t.id = q.topic_id
         where q.topic_id = c.tid::uuid and q.active
         order by random()
         limit (c.cnt)::int
      ) s;
    if jsonb_array_length(v_qs) = 0 then
      raise exception 'Chưa có câu hỏi được cấu hình. Nhờ Tổ Trưởng thiết lập đề.';
    end if;
  end if;

  select username into v_name from public.profiles where user_id = v_uid;
  insert into public.exam_submissions(code, user_id, username, questions, q_count, mode)
    values (public.exam_code(), v_uid, v_name, v_qs, jsonb_array_length(v_qs), v_mode)
    returning * into p;
  if v_mode = 'intern' then
    update public.exam_members set intern_remaining = intern_remaining - 1, intern_used = intern_used + 1 where user_id = v_uid;
  else
    update public.exam_members set remaining = remaining - 1, used = used + 1 where user_id = v_uid;
  end if;

  return jsonb_build_object(
    'resumed', false, 'id', p.id, 'code', p.code, 'duration', v_dur, 'elapsed', 0, 'mode', v_mode,
    'questions', (select coalesce(jsonb_agg(jsonb_build_object(
         'topic', q->>'topic', 'question', q->>'question', 'image_url', q->>'image_url',
         'en_topic', coalesce(q->>'en_topic', ''), 'en_question', coalesce(q->>'en_question', ''),
         'en_image_url', coalesce(q->>'en_image_url', ''))
         order by ord), '[]'::jsonb)
       from jsonb_array_elements(v_qs) with ordinality t(q, ord)),
    'remaining', v_rem - 1);
end $$;

-- ---------------- 5. Nộp bài ----------------
-- Nộp muộn (máy tắt / đóng tab lúc hết giờ, mở lại mới nộp bản nháp) thì tính
-- như nộp ĐÚNG LÚC HẾT GIỜ: thời gian làm = thời gian quy định, tháng = tháng làm bài.
create or replace function public.exam_submit(p_id uuid, p_answers jsonb, p_duration int)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lim int;
  v_el  int;
  p     public.exam_submissions%rowtype;
begin
  select * into p from public.exam_submissions
   where id = p_id and user_id = v_uid and status = 'doing';
  if p.id is null then raise exception 'Không tìm thấy bài đang làm (có thể đã nộp rồi).'; end if;

  v_lim := public.exam_dur(p.mode) * 60;
  v_el  := greatest(1, floor(extract(epoch from (now() - p.started_at)))::int);
  perform public._exam_finalize(p.id, p_answers,
    least(coalesce(p_duration, v_el), v_el, v_lim),
    case when v_el > v_lim + 60 then p.started_at + make_interval(secs => v_lim) else now() end);

  return jsonb_build_object('code', p.code, 'count', p.q_count);
end $$;

-- ---------------- 6. Bài của chính mình (thêm chế độ) ----------------
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
             'code', s.code, 'time', s.submitted_at, 'duration_sec', s.duration_sec, 'mode', s.mode,
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

-- ---------------- 7. Danh sách bài cho Tổ Trưởng (thêm chế độ) ----------------
create or replace function public.exam_list()
returns jsonb language plpgsql security definer
set search_path = public
as $$
begin
  if public.my_role() not in ('admin','totruong') then
    raise exception 'Chức năng này chỉ dành cho Tổ Trưởng trở lên.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'code', s.code, 'username', coalesce(pr.username, s.username),
             'time', s.submitted_at, 'duration_sec', s.duration_sec, 'mode', s.mode,
             'count', s.q_count, 'total', s.total, 'graded', s.graded)
           order by s.graded asc, s.submitted_at desc)
      from public.exam_submissions s
      left join public.profiles pr on pr.user_id = s.user_id
     where s.status = 'done'), '[]'::jsonb);
end $$;

-- ---------------- 8. Danh sách tài khoản + lượt (thêm lượt thực tập) ----------------
create or replace function public.exam_members_list()
returns jsonb language plpgsql security definer
set search_path = public
as $$
begin
  if public.my_role() not in ('admin','totruong') then
    raise exception 'Chức năng này chỉ dành cho Tổ Trưởng trở lên.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', p.user_id, 'username', p.username,
             'role', case when p.is_admin then 'admin'
                          when coalesce(p.perms->>'_role','nhanvien') = 'totruong' then 'totruong'
                          else 'nhanvien' end,
             'remaining', coalesce(m.remaining, 0), 'used', coalesce(m.used, 0),
             'intern_remaining', coalesce(m.intern_remaining, 0), 'intern_used', coalesce(m.intern_used, 0),
             'exam_cfg', m.exam_cfg)
           order by p.username)
      from public.profiles p
      left join public.exam_members m on m.user_id = p.user_id), '[]'::jsonb);
end $$;

-- ---------------- 9. Xếp hạng: CHỈ bài Định Kỳ Tháng ----------------
create or replace function public.exam_rank(p_month text)
returns jsonb language plpgsql security definer
set search_path = public
as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'name', b.username, 'total', b.total, 'count', b.q_count,
             'avg', b.avg, 'time', b.submitted_at) order by b.avg desc, b.total desc)
      from (
        select distinct on (s.user_id)
               coalesce(pr.username, s.username) as username,
               s.total, s.q_count, s.submitted_at,
               (s.total / nullif(s.q_count, 0)) as avg
          from public.exam_submissions s
          left join public.profiles pr on pr.user_id = s.user_id
         where s.graded and s.q_count > 0 and s.mode = 'monthly'
           and (p_month = 'all' or s.month = p_month)
         order by s.user_id, (s.total / nullif(s.q_count, 0)) desc nulls last, s.total desc
      ) b), '[]'::jsonb);
end $$;

-- ---------------- 10. Quyền gọi ----------------
revoke all on function public.exam_start(text) from public, anon;
grant execute on function public.exam_start(text) to authenticated;
-- Hàm phụ: chỉ các RPC ở trên được dùng (chúng chạy bằng quyền chủ sở hữu).
-- _exam_finalize ghi bài KHÔNG kiểm quyền -> tuyệt đối không mở cho authenticated.
revoke all on function public._exam_finalize(uuid, jsonb, int, timestamptz) from public, anon, authenticated;
revoke all on function public.exam_intern_counts() from public, anon, authenticated;
revoke all on function public.exam_dur(text) from public, anon, authenticated;

-- Xong. Không cần deploy Edge Function nào.
