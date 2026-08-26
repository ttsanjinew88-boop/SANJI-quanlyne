-- ============================================================
-- KIỂM TRA NGHIỆP VỤ (tab T5) — bảng + RLS + RPC
-- Chạy 1 lần trong Supabase -> SQL Editor -> New query -> dán -> Run.
-- Cần chạy SAU các file: supabase_setup / auth_setup / update2 / update3 / update4
-- (dùng lại hàm public.my_role() đã có ở update2).
--
-- ===================== NGUYÊN TẮC BẢO MẬT =====================
-- Repo là PUBLIC và dashboard chạy bằng anon key, nên KHÔNG được tin frontend.
-- Vì vậy chia làm 2 đường:
--   • Tổ Trưởng / Admin  -> đọc ghi THẲNG các bảng (RLS chặn người khác).
--   • Nhân viên          -> CHỈ gọi được các hàm RPC bên dưới, KHÔNG có quyền
--     SELECT trên exam_questions / exam_submissions / exam_answers.
-- Nhờ vậy ĐÁP ÁN MẪU không bao giờ rò rỉ: đề do server bốc ngẫu nhiên và trả về
-- bản đã cắt bỏ đáp án; nhân viên cũng không tự sửa được điểm hay số lượt.
-- ============================================================

create extension if not exists pgcrypto;

-- ==================== 1. BẢNG ====================

-- Chủ đề (Tự luận nghiệp vụ, Sảnh — Slot, …)
create table if not exists public.exam_topics (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text not null default '#7c3aed',
  created_at timestamptz not null default now()
);

-- Ngân hàng câu hỏi. `answer` = đáp án mẫu — CHỈ Tổ Trưởng trở lên đọc được.
create table if not exists public.exam_questions (
  id         uuid primary key default gen_random_uuid(),
  topic_id   uuid not null references public.exam_topics(id) on delete cascade,
  level      text not null default 'Trung bình',
  question   text not null,
  image_url  text,
  answer     text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists exam_questions_topic_idx on public.exam_questions(topic_id) where active;

-- Cấu trúc đề CHUNG: mỗi chủ đề bốc bao nhiêu câu
create table if not exists public.exam_config (
  topic_id uuid primary key references public.exam_topics(id) on delete cascade,
  count    int not null default 0
);

-- Cài đặt: duration (phút) · show_answer ('yes'/'no')
create table if not exists public.exam_settings (
  key   text primary key,
  value text
);
insert into public.exam_settings(key, value) values ('duration', '45')
  on conflict (key) do nothing;
insert into public.exam_settings(key, value) values ('show_answer', 'no')
  on conflict (key) do nothing;

-- Lượt test + đề riêng của từng tài khoản. Khóa theo user_id (UUID) chứ KHÔNG
-- theo tên -> đổi tên tài khoản vẫn giữ nguyên lịch sử test.
create table if not exists public.exam_members (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  remaining int not null default 0,
  used      int not null default 0,
  exam_cfg  jsonb                       -- null = dùng đề chung
);

-- Mỗi lần làm bài. `questions` giữ NGUYÊN đề đã bốc (kèm đáp án) để F5 / mất mạng
-- vào lại vẫn đúng đề cũ và không tốn thêm lượt.
create table if not exists public.exam_submissions (
  id           uuid primary key default gen_random_uuid(),
  code         text unique,             -- mã bài hiển thị: EX26082612...
  user_id      uuid not null references auth.users(id) on delete cascade,
  username     text,
  status       text not null default 'doing',   -- doing | done | abandoned
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  duration_sec int,
  month        text,                    -- 'YYYY-MM' theo GMT+7, dùng lọc xếp hạng
  questions    jsonb,
  q_count      int not null default 0,
  total        numeric not null default 0,
  graded       boolean not null default false
);
create index if not exists exam_sub_user_idx  on public.exam_submissions(user_id, started_at desc);
create index if not exists exam_sub_month_idx on public.exam_submissions(month) where graded;
create index if not exists exam_sub_doing_idx on public.exam_submissions(user_id) where status = 'doing';

-- Từng câu trong 1 bài. Tách bảng để chấm điểm/ghi chú theo câu.
create table if not exists public.exam_answers (
  id            bigserial primary key,
  submission_id uuid not null references public.exam_submissions(id) on delete cascade,
  idx           int  not null,
  topic_name    text,
  question      text,
  image_url     text,
  sample_answer text,
  reply         text,
  score         numeric,
  note          text
);
create index if not exists exam_answers_sub_idx on public.exam_answers(submission_id, idx);

-- ==================== 2. RLS ====================

alter table public.exam_topics      enable row level security;
alter table public.exam_questions   enable row level security;
alter table public.exam_config      enable row level security;
alter table public.exam_settings    enable row level security;
alter table public.exam_members     enable row level security;
alter table public.exam_submissions enable row level security;
alter table public.exam_answers     enable row level security;

-- Chủ đề / cấu trúc đề / cài đặt: ai đăng nhập cũng ĐỌC được (màn giới thiệu cần
-- hiện tên chủ đề + số câu + thời gian). Không có gì bí mật ở đây.
drop policy if exists exam_topics_read on public.exam_topics;
create policy exam_topics_read on public.exam_topics
  for select to authenticated using (true);
drop policy if exists exam_topics_write on public.exam_topics;
create policy exam_topics_write on public.exam_topics
  for all to authenticated
  using (public.my_role() in ('admin','totruong'))
  with check (public.my_role() in ('admin','totruong'));

drop policy if exists exam_config_read on public.exam_config;
create policy exam_config_read on public.exam_config
  for select to authenticated using (true);
drop policy if exists exam_config_write on public.exam_config;
create policy exam_config_write on public.exam_config
  for all to authenticated
  using (public.my_role() in ('admin','totruong'))
  with check (public.my_role() in ('admin','totruong'));

drop policy if exists exam_settings_read on public.exam_settings;
create policy exam_settings_read on public.exam_settings
  for select to authenticated using (true);
drop policy if exists exam_settings_write on public.exam_settings;
create policy exam_settings_write on public.exam_settings
  for all to authenticated
  using (public.my_role() in ('admin','totruong'))
  with check (public.my_role() in ('admin','totruong'));

-- ⚠ NGÂN HÀNG CÂU HỎI: chỉ Tổ Trưởng trở lên được đọc (cột answer = đáp án mẫu).
-- Nhân viên nhận đề qua RPC exam_start(), đã cắt bỏ đáp án.
drop policy if exists exam_questions_tt on public.exam_questions;
create policy exam_questions_tt on public.exam_questions
  for all to authenticated
  using (public.my_role() in ('admin','totruong'))
  with check (public.my_role() in ('admin','totruong'));

-- Lượt test: tự xem được dòng của mình; chỉ Tổ Trưởng được sửa.
drop policy if exists exam_members_read on public.exam_members;
create policy exam_members_read on public.exam_members
  for select to authenticated
  using (user_id = auth.uid() or public.my_role() in ('admin','totruong'));
drop policy if exists exam_members_write on public.exam_members;
create policy exam_members_write on public.exam_members
  for all to authenticated
  using (public.my_role() in ('admin','totruong'))
  with check (public.my_role() in ('admin','totruong'));

-- ⚠ BÀI LÀM: chỉ Tổ Trưởng trở lên đọc thẳng (2 bảng này chứa đáp án mẫu).
-- Nhân viên xem bài của chính mình qua RPC exam_my_list() — hàm đó mới là chỗ
-- quyết định có kèm đáp án hay không, theo cài đặt show_answer.
drop policy if exists exam_sub_tt on public.exam_submissions;
create policy exam_sub_tt on public.exam_submissions
  for select to authenticated using (public.my_role() in ('admin','totruong'));

drop policy if exists exam_ans_tt on public.exam_answers;
create policy exam_ans_tt on public.exam_answers
  for select to authenticated using (public.my_role() in ('admin','totruong'));
drop policy if exists exam_ans_tt_upd on public.exam_answers;
create policy exam_ans_tt_upd on public.exam_answers
  for update to authenticated
  using (public.my_role() in ('admin','totruong'))
  with check (public.my_role() in ('admin','totruong'));

-- ==================== 3. RPC ====================
-- Tất cả đều SECURITY DEFINER: chạy bằng quyền chủ sở hữu, bỏ qua RLS, và tự
-- kiểm tra quyền bên trong. Đây là đường DUY NHẤT nhân viên chạm tới bài test.

-- Giờ Việt Nam, dùng thống nhất cho cột month
create or replace function public.exam_month(t timestamptz)
returns text language sql immutable
as $$ select to_char(t at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') $$;

-- Mã bài hiển thị: EX + yyMMddHHmmss (giờ Việt Nam)
create or replace function public.exam_code()
returns text language sql volatile
as $$ select 'EX' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMMDDHH24MISS') $$;

-- ---- 3.1 Dữ liệu mở tab: chủ đề, cấu trúc đề, cài đặt, lượt của tôi, bài dở ----
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
    'topics', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'color', color) order by name)
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

-- ---- 3.2 Bắt đầu / làm tiếp bài ----
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
             'topic', q->>'topic', 'question', q->>'question', 'image_url', q->>'image_url')
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
  -- không tự chọn được câu dễ.
  select coalesce(jsonb_agg(x order by random()), '[]'::jsonb) into v_qs
    from jsonb_each_text(v_cfg) c(tid, cnt)
    cross join lateral (
      select jsonb_build_object(
               'topic', t.name, 'question', q.question,
               'image_url', coalesce(q.image_url, ''), 'answer', coalesce(q.answer, '')) as x
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
         'topic', q->>'topic', 'question', q->>'question', 'image_url', q->>'image_url')
         order by ord), '[]'::jsonb)
       from jsonb_array_elements(v_qs) with ordinality t(q, ord)),
    'remaining', m.remaining - 1);
end $$;

-- ---- 3.3 Nộp bài ----
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

  insert into public.exam_answers(submission_id, idx, topic_name, question, image_url, sample_answer, reply)
  select p.id, (ord - 1)::int, q->>'topic', q->>'question', q->>'image_url', q->>'answer',
         coalesce(p_answers->>((ord - 1)::int), '')
    from jsonb_array_elements(p.questions) with ordinality t(q, ord);

  update public.exam_submissions
     set status = 'done', submitted_at = now(), duration_sec = greatest(1, coalesce(p_duration, 0)),
         month = public.exam_month(now())
   where id = p.id;

  return jsonb_build_object('code', p.code, 'count', p.q_count);
end $$;

-- ---- 3.4 Bài của chính mình ----
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
                        'reply', a.reply, 'answer', case when v_show then a.sample_answer else '' end,
                        'score', a.score, 'note', a.note) order by a.idx)
                 from public.exam_answers a where a.submission_id = s.id), '[]'::jsonb))
           order by s.submitted_at desc)
      from public.exam_submissions s
     where s.user_id = v_uid and s.status = 'done'), '[]'::jsonb));
end $$;

-- ---- 3.5 Chấm điểm (Tổ Trưởng trở lên) ----
-- p_grades = [{"score":1,"note":"..."}, ...] cùng thứ tự câu trong bài
create or replace function public.exam_grade(p_id uuid, p_grades jsonb)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare v_n int;
begin
  if public.my_role() not in ('admin','totruong') then
    raise exception 'Chức năng này chỉ dành cho Tổ Trưởng trở lên.';
  end if;

  update public.exam_answers a
     set score = nullif(g->>'score', '')::numeric,
         note  = coalesce(g->>'note', '')
    from jsonb_array_elements(p_grades) with ordinality t(g, ord)
   where a.submission_id = p_id and a.idx = (ord - 1)::int;
  get diagnostics v_n = row_count;

  update public.exam_submissions s
     set total  = coalesce((select sum(coalesce(a.score, 0)) from public.exam_answers a where a.submission_id = s.id), 0),
         graded = exists (select 1 from public.exam_answers a where a.submission_id = s.id and a.score is not null)
   where s.id = p_id;

  return jsonb_build_object('graded', v_n);
end $$;

-- ---- 3.6 Danh sách bài cho Tổ Trưởng (tóm tắt, không kèm nội dung) ----
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
             'time', s.submitted_at, 'duration_sec', s.duration_sec,
             'count', s.q_count, 'total', s.total, 'graded', s.graded)
           order by s.graded asc, s.submitted_at desc)
      from public.exam_submissions s
      left join public.profiles pr on pr.user_id = s.user_id
     where s.status = 'done'), '[]'::jsonb);
end $$;

-- ---- 3.7 Danh sách tài khoản + lượt test (Tổ Trưởng trở lên) ----
-- Lấy thẳng từ bảng profiles -> KHÔNG phải gõ tay tên nhân viên ở đâu cả.
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
             'exam_cfg', m.exam_cfg)
           order by p.username)
      from public.profiles p
      left join public.exam_members m on m.user_id = p.user_id), '[]'::jsonb);
end $$;

-- ---- 3.8 Xếp hạng ----
-- Mỗi người chỉ lấy BÀI TỐT NHẤT trong kỳ -> làm nhiều lượt không tạo lợi thế.
-- p_month = 'YYYY-MM' hoặc 'all'.
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
         where s.graded and s.q_count > 0
           and (p_month = 'all' or s.month = p_month)
         order by s.user_id, (s.total / nullif(s.q_count, 0)) desc nulls last, s.total desc
      ) b), '[]'::jsonb);
end $$;

-- ==================== 4. QUYỀN GỌI RPC ====================
revoke all on function public.exam_boot(), public.exam_start(),
  public.exam_submit(uuid, jsonb, int), public.exam_my_list(),
  public.exam_grade(uuid, jsonb), public.exam_list(),
  public.exam_members_list(), public.exam_rank(text) from public, anon;

grant execute on function public.exam_boot(), public.exam_start(),
  public.exam_submit(uuid, jsonb, int), public.exam_my_list(),
  public.exam_grade(uuid, jsonb), public.exam_list(),
  public.exam_members_list(), public.exam_rank(text) to authenticated;

-- ==================== 5. DỮ LIỆU MẪU (chỉ khi bảng còn trống) ====================
insert into public.exam_topics(name, color)
select * from (values
  ('Tự luận nghiệp vụ', '#7c3aed'),
  ('Sảnh — Roulette',   '#f59e0b'),
  ('Sảnh — Baccarat',   '#10b981'),
  ('Sảnh — Slot',       '#3b82f6'),
  ('Sảnh — Thể thao',   '#06b6d4'),
  ('Xử lý tình huống',  '#ec4899')
) v(name, color)
where not exists (select 1 from public.exam_topics);

insert into public.exam_config(topic_id, count)
select id, 0 from public.exam_topics
  on conflict (topic_id) do nothing;
