// ===================== T5 — KIỂM TRA NGHIỆP VỤ =====================
// Dữ liệu nằm 100% trong Google Sheet (Apps Script `google_sheet_test.gs`).
// Mọi request đi qua Edge Function `super-function` (action 'exam'): URL + token
// nằm trong secret Supabase, danh tính/vai trò do server xác định từ JWT.
// Frontend KHÔNG bao giờ nhận đáp án mẫu khi đang làm bài, và không thể tự khai
// mình là Tổ Trưởng (repo public — mọi thứ trong file này đều đọc được).
//
// Khóa dữ liệu theo user_id (UUID Supabase) chứ không theo tên: đổi tên tài khoản
// vẫn giữ nguyên lịch sử test (bài học từ vụ CHAMY -> SOLIS ở bảng bất thường).
const EX = {
  VIEWS: [
    { k: 'lam',  t: 'Làm Bài' },
    { k: 'bai',  t: 'Bài Của Tôi' },
    { k: 'de',   t: 'Quản Lý Đề', tt: 1 },
    { k: 'nv',   t: 'Quản Lý Nhân Viên', tt: 1 },
    { k: 'cham', t: 'Chấm Điểm', tt: 1 }
  ],
  view: 'lam',
  D: null,          // dữ liệu boot: {topics,bank,config,settings,me,pending}
  loading: false,
  stage: 'intro',   // intro | doing | done
  run: null,        // bài đang làm: {sid,startedAt,duration,questions,answers,cur}
  tmr: null,
  subs: null,       // danh sách bài cho TT (tab Chấm Điểm)
  mine: null,       // bài của chính mình
  members: null,
  editQ: null,      // id câu hỏi đang sửa
  editT: null,      // id chủ đề đang sửa
  bankFilter: 'all',
  selTopic: null,   // chủ đề đang xem ở rail tab Quản Lý Đề
  selSub: null,     // mã bài đang chấm

  canEdit() { const r = CUR_PROFILE ? roleOf(CUR_PROFILE) : null; return !!(CUR_PROFILE && (CUR_PROFILE.is_admin || (r && r.key === 'totruong'))); },

  // ---------- gọi Edge Function ----------
  async call(action, payload) {
    if (!SB.ready()) throw new Error('Chưa cấu hình cloud');
    const { data: sess } = await SB.client().auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('Phiên hết hạn, đăng nhập lại');
    const r = await fetch(SB_URL + '/functions/v1/super-function', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'apikey': SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'exam', ex: { action, payload: payload || {} } })
    });
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!j) throw new Error('Không gọi được máy chủ (đã deploy lại super-function chưa?)');
    if (!j.ok) throw new Error(j.description || 'Lỗi không rõ');
    return j.data;
  },

  // ---------- nạp dữ liệu (gọi khi mở tab lần đầu) ----------
  // Render SAU khi nạp xong: render trước rồi mới nạp sẽ khiến thao tác trong lúc
  // chờ bị dữ liệu cloud ghi đè (đúng lỗi đã vấp ở module Nhắc Nhở).
  async boot(force) {
    if (this.loading) return;
    if (this.D && !force) { this.render(); return; }
    this.loading = true;
    const body = document.getElementById('exBody');
    if (body) body.innerHTML = '<div class="chart-card" style="text-align:center;color:var(--mu);font-size:.72rem">Đang tải dữ liệu bài test…</div>';
    try {
      this.D = await this.call('boot');
      this.loading = false;
      this.renderViews();
      this.render();
    } catch (e) {
      this.loading = false;
      if (body) body.innerHTML = '<div class="chart-card" style="color:var(--re);font-size:.72rem">Lỗi tải dữ liệu: ' + hesc(e.message || e) +
        '<div style="color:var(--mu);margin-top:8px;font-weight:400">Kiểm tra: đã deploy lại <b>super-function</b>, đã đặt 2 secret <b>GS_EXAM_URL</b> / <b>GS_EXAM_TOKEN</b>, và đã Deploy bản mới của <b>google_sheet_test.gs</b> chưa.</div></div>';
    }
  },

  // ---------- tiện ích ----------
  topicById(id) { return (this.D.topics || []).find(t => t.id === id) || { id: id, name: '(đã xóa)', color: '#64748b' }; },
  fmtScore(n) { n = Number(n) || 0; return Number.isInteger(n) ? String(n) : n.toFixed(2); },
  fmtDur(sec) { sec = Number(sec) || 0; return Math.floor(sec / 60) + ' phút ' + (sec % 60) + ' giây'; },
  fmtTime(t) { const m = String(t).match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2}):\d{2}/); return m ? (m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4]) : String(t); },
  imgHtml(url, max) {
    if (!url) return '';
    return '<div class="ex-img"' + (max ? ' style="max-width:' + max + '"' : '') + '><img src="' + hesc(url) +
      '" loading="lazy" onerror="this.parentNode.innerHTML=\'<span class=&quot;ex-imgerr&quot;>Không tải được ảnh — kiểm tra link đã chia sẻ công khai chưa.</span>\'"></div>';
  },
  toast(m) {
    let t = document.getElementById('exToast');
    if (!t) { t = document.createElement('div'); t.id = 'exToast'; t.className = 'ex-toast'; document.body.appendChild(t); }
    t.textContent = m; t.classList.add('on');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('on'), 2200);
  },

  // ---------- khung tab nhỏ ----------
  renderViews() {
    const tt = this.canEdit();
    const el = document.getElementById('exViews');
    if (!el) return;
    const list = this.VIEWS.filter(v => !v.tt || tt);
    if (!list.some(v => v.k === this.view)) this.view = 'lam';
    el.innerHTML = list.map(v => '<button class="vt-btn' + (this.view === v.k ? ' active' : '') + '" onclick="EX.setView(\'' + v.k + '\')">' + v.t + '</button>').join('');
  },
  setView(k) {
    if (this.stage === 'doing' && k !== 'lam') {
      if (!confirm('Bạn đang làm bài dở. Rời khỏi trang làm bài?\n\nCâu trả lời đã gõ vẫn được giữ, quay lại tab Làm Bài là làm tiếp được.')) return;
    }
    this.view = k; this.renderViews(); this.render();
  },
  render() {
    const b = document.getElementById('exBody');
    if (!b || !this.D) return;
    if (this.view === 'lam') this.renderLam(b);
    else if (this.view === 'bai') this.renderBai(b);
    else if (this.view === 'de') this.renderDe(b);
    else if (this.view === 'nv') this.renderNv(b);
    else if (this.view === 'cham') this.renderCham(b);
  },

  /* ==================== TAB: LÀM BÀI ==================== */
  renderLam(b) {
    if (this.stage === 'doing') { this.renderDoing(b); return; }
    if (this.stage === 'done') { this.renderDone(b); return; }
    const me = this.D.me, st = this.D.settings, cfg = this.D.me.examCfg || this.D.config;
    const total = Object.keys(cfg).reduce((a, k) => a + (Number(cfg[k]) || 0), 0);
    const chips = (this.D.topics || []).filter(t => (cfg[t.id] || 0) > 0).map(t =>
      '<div class="ex-chip"><div class="ex-chip-n" style="color:' + hesc(t.color) + '">' + (cfg[t.id] || 0) + '</div><div class="ex-chip-l" data-noi18n>' + hesc(String(t.name).replace('Sảnh — ', '')) + '</div></div>').join('');
    const pend = this.D.pending;
    b.innerHTML =
      '<div class="ex-narrow">' +
        '<div class="chart-card">' +
          '<div class="ex-h1">Bài kiểm tra nghiệp vụ</div>' +
          '<div class="ex-sub">Chúc bạn làm bài thật tốt. Đọc kỹ đề trước khi trả lời.</div>' +
          '<div class="ex-chips">' + chips +
            '<div class="ex-chip"><div class="ex-chip-n">' + total + '</div><div class="ex-chip-l">Tổng câu</div></div>' +
            '<div class="ex-chip"><div class="ex-chip-n">' + (st.duration || 45) + '</div><div class="ex-chip-l">Phút</div></div>' +
          '</div>' +
          (me.examCfg ? '<div class="ex-note ex-note-go">Bạn đang dùng <b>đề riêng</b> do Tổ Trưởng thiết lập.</div>' : '') +
          (pend ? '<div class="ex-note ex-note-go">Bạn có một bài <b>đang làm dở</b> <span>(' + pend.count + ' câu, bắt đầu ' + this.fmtTime(pend.startedAt) + '). Bấm nút dưới để làm tiếp — không tốn thêm lượt.</span></div>' : '') +
          '<div class="ex-meta">Tài khoản: <b>' + hesc((CUR_PROFILE && CUR_PROFILE.username) || '') + '</b> · Lượt còn lại: <b class="' + (me.remaining > 0 ? 'ex-ok' : 'ex-bad') + '">' + me.remaining + '</b> · Đã làm: <b>' + me.used + '</b> lần</div>' +
          (me.remaining <= 0 && !pend ? '<div class="ex-note ex-note-re">Bạn đã hết lượt làm bài. Liên hệ Tổ Trưởng để được cấp thêm.</div>' : '') +
          '<div style="margin-top:16px"><button class="abtn abtn-pu" id="exStartBtn" onclick="EX.start()"' + ((me.remaining <= 0 && !pend) ? ' disabled' : '') + '>' + (pend ? 'Làm tiếp bài dở →' : 'Bắt đầu làm bài →') + '</button></div>' +
        '</div>' +
      '</div>';
  },
  async start() {
    const btn = document.getElementById('exStartBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang chuẩn bị đề…'; }
    try {
      const r = await this.call('start');
      const draft = this.draftGet(r.sid);
      // Mốc hết giờ suy từ `elapsed` (giây, do SERVER tính) chứ không parse chuỗi
      // thời gian của Apps Script: chuỗi không mang múi giờ, máy nhân viên lệch
      // múi giờ là đồng hồ chạy sai hoặc báo hết giờ ngay lập tức.
      this.run = {
        sid: r.sid, startedAt: r.startedAt, duration: r.duration,
        t0: Date.now() - (Number(r.elapsed) || 0) * 1000,
        questions: r.questions, answers: r.questions.map((q, i) => (draft && draft[i]) || ''), cur: 0
      };
      this.stage = 'doing';
      this.D.me.remaining = r.remaining;
      this.render();
      this.startTimer();
      if (r.resumed) this.toast('Đã khôi phục bài đang làm dở');
    } catch (e) {
      alert('Không bắt đầu được: ' + (e.message || e));
      if (btn) { btn.disabled = false; btn.textContent = 'Bắt đầu làm bài →'; }
    }
  },
  // Nháp lưu ngay trên máy: đóng nhầm tab / mất điện vẫn còn chữ đã gõ
  draftKey(sid) { return 'ex_draft_' + sid; },
  draftGet(sid) { try { return JSON.parse(localStorage.getItem(this.draftKey(sid)) || 'null'); } catch (e) { return null; } },
  draftSave() { try { localStorage.setItem(this.draftKey(this.run.sid), JSON.stringify(this.run.answers)); } catch (e) {} },
  draftClear(sid) { try { localStorage.removeItem(this.draftKey(sid)); } catch (e) {} },

  renderDoing(b) {
    const r = this.run, q = r.questions[r.cur], t = this.topicById(q.topic);
    const nav = r.questions.map((_, i) =>
      '<button class="ex-qn' + (i === r.cur ? ' on' : '') + (r.answers[i] ? ' filled' : '') + '" onclick="EX.goQ(' + i + ')" title="Câu ' + (i + 1) + '">' + (i + 1) + '</button>').join('');
    const filled = r.answers.filter(a => a && a.trim()).length;
    b.innerHTML =
      '<div class="ex-bar">' +
        '<div class="ex-bar-l">Câu ' + (r.cur + 1) + ' / ' + r.questions.length + ' · Đã trả lời ' + filled + '</div>' +
        '<div class="ex-prog"><div class="ex-prog-f" style="width:' + ((r.cur + 1) / r.questions.length * 100) + '%"></div></div>' +
        '<div class="ex-timer" id="exTimer">--:--</div>' +
      '</div>' +
      '<div class="ex-doing">' +
        '<div class="chart-card ex-qcard">' +
          '<span class="ex-badge" style="background:' + hesc(t.color) + '22;color:' + hesc(t.color) + '" data-noi18n>' + hesc(t.name) + '</span>' +
          '<div class="ex-q" data-noi18n>' + hesc(q.question) + '</div>' +
          this.imgHtml(q.imageUrl) +
          '<textarea class="ex-ta" id="exAns" placeholder="Nhập câu trả lời của bạn…" oninput="EX.onType()">' + hesc(r.answers[r.cur] || '') + '</textarea>' +
          '<div class="ex-lock">Đáp án được ẩn — chỉ Tổ Trưởng thấy khi chấm bài</div>' +
          '<div class="ex-actions">' +
            '<button class="abtn abtn-ghost" onclick="EX.goQ(' + (r.cur - 1) + ')"' + (r.cur === 0 ? ' disabled' : '') + '>← Câu trước</button>' +
            '<button class="abtn abtn-pu" onclick="EX.next()">' + (r.cur === r.questions.length - 1 ? 'Nộp bài ✓' : 'Câu tiếp →') + '</button>' +
            '<button class="abtn abtn-ok" onclick="EX.submit()">Nộp bài ngay</button>' +
          '</div>' +
        '</div>' +
        '<div class="chart-card ex-navcard">' +
          '<div class="ex-navh">Danh sách câu</div>' +
          '<div class="ex-qnav">' + nav + '</div>' +
          '<div class="ex-navlegend"><span><i class="lg-filled"></i>Đã trả lời</span><span><i class="lg-empty"></i>Bỏ trống</span></div>' +
        '</div>' +
      '</div>';
    this.paintTimer();
  },
  onType() { const el = document.getElementById('exAns'); if (!el) return; this.run.answers[this.run.cur] = el.value; this.draftSave(); },
  saveCur() { const el = document.getElementById('exAns'); if (el) this.run.answers[this.run.cur] = el.value.trim(); this.draftSave(); },
  goQ(i) {
    if (i < 0 || i >= this.run.questions.length) return;
    this.saveCur(); this.run.cur = i; this.render();
  },
  next() {
    this.saveCur();
    if (this.run.cur < this.run.questions.length - 1) { this.run.cur++; this.render(); }
    else this.submit();
  },
  // Đồng hồ tính từ startedAt của SERVER -> F5 hay đổi máy vẫn đúng giờ còn lại
  startTimer() {
    clearInterval(this.tmr);
    this.tmr = setInterval(() => this.paintTimer(), 1000);
  },
  leftSec() { return Math.max(0, Math.round((this.run.t0 + this.run.duration * 60000 - Date.now()) / 1000)); },
  paintTimer() {
    const el = document.getElementById('exTimer');
    if (!el || !this.run) return;
    const s = this.leftSec();
    el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    el.classList.toggle('warn', s <= 300);
    if (s <= 0) { clearInterval(this.tmr); this.tmr = null; alert('Hết giờ! Bài của bạn sẽ được nộp.'); this.submit(true); }
  },
  async submit(auto) {
    this.saveCur();
    const empty = this.run.answers.filter(a => !a || !a.trim()).length;
    if (!auto) {
      const msg = empty ? ('Bạn còn ' + empty + ' câu chưa trả lời. Vẫn nộp bài?') : 'Bạn chắc chắn nộp bài?';
      if (!confirm(msg)) return;
    }
    clearInterval(this.tmr); this.tmr = null;
    const dur = Math.max(1, Math.round((Date.now() - this.run.t0) / 1000));
    const snap = { sid: this.run.sid, count: this.run.questions.length, filled: this.run.answers.filter(a => a && a.trim()).length, dur: dur };
    try {
      await this.call('submit', { sid: this.run.sid, answers: this.run.answers, durationSec: dur });
      this.draftClear(this.run.sid);
      this.D.pending = null;
      this.mine = null;
      this.stage = 'done'; this.doneInfo = snap; this.run = null;
      this.render();
    } catch (e) {
      alert('Nộp bài không thành công: ' + (e.message || e) + '\n\nCâu trả lời của bạn vẫn được giữ — kiểm tra mạng rồi bấm Nộp bài lại.');
      if (!auto) this.startTimer();
    }
  },
  renderDone(b) {
    const d = this.doneInfo || { count: 0, filled: 0, dur: 0, sid: '' };
    b.innerHTML =
      '<div class="ex-narrow"><div class="chart-card" style="text-align:center;padding:32px 20px">' +
        '<div class="ex-done-ic">✓</div>' +
        '<div class="ex-h1" style="margin-top:10px">Đã nộp bài</div>' +
        '<div class="ex-sub">Bài của bạn đã lưu về hệ thống, chờ Tổ Trưởng chấm điểm.</div>' +
        '<div class="ex-chips" style="justify-content:center;margin-top:18px">' +
          '<div class="ex-chip"><div class="ex-chip-n">' + d.count + '</div><div class="ex-chip-l">Tổng câu</div></div>' +
          '<div class="ex-chip"><div class="ex-chip-n">' + d.filled + '</div><div class="ex-chip-l">Có trả lời</div></div>' +
          '<div class="ex-chip"><div class="ex-chip-n" style="font-size:.9rem">' + this.fmtDur(d.dur) + '</div><div class="ex-chip-l">Thời gian</div></div>' +
        '</div>' +
        '<div class="ex-meta" style="margin-top:14px">Mã bài: <b data-noi18n>' + hesc(d.sid) + '</b></div>' +
        '<div style="margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
          '<button class="abtn abtn-ghost" onclick="EX.setView(\'bai\')">Xem bài của tôi</button>' +
          '<button class="abtn abtn-pu" onclick="EX.stage=\'intro\';EX.boot(true)">Về trang đầu</button>' +
        '</div>' +
      '</div></div>';
  },

  /* ==================== TAB: BÀI CỦA TÔI ==================== */
  async renderBai(b) {
    if (!this.mine) {
      b.innerHTML = '<div class="chart-card" style="text-align:center;color:var(--mu);font-size:.72rem">Đang tải bài đã nộp…</div>';
      try { this.mine = await this.call('mine'); } catch (e) { b.innerHTML = '<div class="chart-card" style="color:var(--re);font-size:.72rem">Lỗi: ' + hesc(e.message || e) + '</div>'; return; }
      if (this.view !== 'bai') return;
    }
    const res = this.mine;
    if (!res.submissions.length) { b.innerHTML = '<div class="chart-card" style="text-align:center;color:var(--mu);font-size:.72rem">Bạn chưa có bài test nào.</div>'; return; }
    b.innerHTML = '<div class="sec-hdr pu">Bài đã nộp <span class="cnt-badge">' + res.submissions.length + '</span></div>' +
      res.submissions.map((s, i) => this.subCardHtml(s, i, 'mine')).join('') +
      (res.showAnswer ? '' : '<div class="ex-meta" style="margin-top:10px">Đáp án mẫu đang được ẩn. Tổ Trưởng có thể bật trong Quản Lý Đề → Cài đặt bài thi.</div>');
  },
  subCardHtml(s, i, kind) {
    const badge = s.graded
      ? '<span class="ex-badge ex-b-ok">Đã chấm · ' + this.fmtScore(s.total) + '/' + s.count + '</span>'
      : '<span class="ex-badge ex-b-wait">Chờ chấm</span>';
    return '<div class="chart-card ex-subcard" style="margin-bottom:10px">' +
      '<div class="ex-subh" onclick="EX.toggleMine(' + i + ')">' +
        '<div><div class="ex-subt" data-noi18n>' + hesc(s.id) + '</div>' +
        '<div class="ex-meta">' + this.fmtTime(s.time) + ' · ' + this.fmtDur(s.durationSec) + ' · ' + s.count + ' câu</div></div>' + badge +
      '</div><div id="exMine' + i + '" style="display:none"></div></div>';
  },
  toggleMine(i) {
    const box = document.getElementById('exMine' + i);
    if (box.style.display !== 'none') { box.style.display = 'none'; return; }
    const s = this.mine.submissions[i];
    box.innerHTML = s.items.map(it => {
      const has = it.score !== '' && it.score != null;
      return '<div class="ex-rev">' +
        '<div class="ex-revq"><span class="ex-badge ex-b-mu" data-noi18n>' + hesc(it.topic) + '</span><span data-noi18n>' + hesc(it.question) + '</span></div>' +
        this.imgHtml(it.imageUrl, '420px') +
        '<div class="ex-reply"><b>Bạn trả lời:</b> ' + (it.reply ? '<span data-noi18n>' + hesc(it.reply) + '</span>' : '<i>(Bỏ trống)</i>') + '</div>' +
        (it.answer ? '<div class="ex-correct"><b>✓ Đáp án mẫu:</b> <span data-noi18n>' + hesc(it.answer) + '</span></div>' : '') +
        (has ? '<div class="ex-meta">Điểm câu: <b>' + this.fmtScore(it.score) + '</b>' + (it.note ? ' · <span data-noi18n>' + hesc(it.note) + '</span>' : '') + '</div>' : '') +
      '</div>';
    }).join('');
    box.style.display = 'block';
  },

  /* ==================== TAB: QUẢN LÝ ĐỀ (TT) ==================== */
  renderDe(b) {
    const st = this.D.settings;
    const topics = this.D.topics || [], bank = this.D.bank || [];
    const total = Object.values(this.D.config).reduce((a, v) => a + (Number(v) || 0), 0);
    const rail = topics.map(t => {
      const avail = bank.filter(x => x.topic === t.id).length;
      return '<div class="ex-trow' + (this.selTopic === t.id ? ' on' : '') + '" onclick="EX.pickTopic(\'' + t.id + '\')">' +
        '<span class="ex-tdot" style="background:' + hesc(t.color) + '"></span>' +
        '<span class="ex-tname" data-noi18n>' + hesc(t.name) + '</span>' +
        '<span class="ex-tavail">' + (this.D.config[t.id] || 0) + '/' + avail + '</span>' +
        '<input type="number" class="ex-num" min="0" max="' + avail + '" value="' + (this.D.config[t.id] || 0) + '" onclick="event.stopPropagation()" onchange="EX.setCfg(\'' + t.id + '\',this.value,' + avail + ')">' +
        '<button class="ex-mini" onclick="event.stopPropagation();EX.openTopic(\'' + t.id + '\')" title="Sửa">✎</button>' +
        '<button class="ex-mini del" onclick="event.stopPropagation();EX.delTopic(\'' + t.id + '\')" title="Xóa">×</button>' +
      '</div>';
    }).join('');
    const items = bank.filter(x => this.selTopic ? x.topic === this.selTopic : true);
    b.innerHTML =
      '<div class="ex-2col">' +
        '<div class="chart-card ex-rail">' +
          '<div class="ex-railh">Chủ đề &amp; số câu <span class="cnt-badge">' + total + '</span></div>' +
          '<div class="ex-trow' + (this.selTopic ? '' : ' on') + '" onclick="EX.pickTopic(null)"><span class="ex-tdot" style="background:var(--mu)"></span><span class="ex-tname">Tất cả chủ đề</span><span class="ex-tavail">' + bank.length + '</span></div>' +
          rail +
          '<button class="abtn abtn-pu abtn-sm" style="margin-top:10px;width:100%;justify-content:center" onclick="EX.openTopic(null)">＋ Thêm chủ đề</button>' +
          '<div class="ex-railh" style="margin-top:18px">Cài đặt bài thi</div>' +
          '<label class="ex-lab">Thời gian làm bài (phút)</label>' +
          '<input class="ex-inp" type="number" id="exSetDur" min="1" max="240" value="' + (st.duration || 45) + '">' +
          '<label class="ex-check"><input type="checkbox" id="exSetAns"' + (st.showAnswerOnLookup ? ' checked' : '') + '> Cho nhân viên xem đáp án mẫu khi tra cứu bài cũ</label>' +
          '<button class="abtn abtn-ok abtn-sm" style="margin-top:10px;width:100%;justify-content:center" onclick="EX.saveSettings()">Lưu cài đặt</button>' +
        '</div>' +
        '<div>' +
          '<div class="chart-card" style="margin-bottom:14px">' +
            '<div class="ex-railh" id="exQFormT">' + (this.editQ ? 'Sửa câu hỏi' : 'Thêm câu hỏi vào ngân hàng') + '</div>' +
            '<div class="ex-frow">' +
              '<div style="flex:2;min-width:180px"><label class="ex-lab">Chủ đề</label><select class="ex-inp" id="exQTopic">' + topics.map(t => '<option value="' + hesc(t.id) + '"' + (this._qt === t.id ? ' selected' : '') + ' data-noi18n>' + hesc(t.name) + '</option>').join('') + '</select></div>' +
              '<div style="flex:1;min-width:130px"><label class="ex-lab">Độ khó</label><select class="ex-inp" id="exQLevel"><option>Dễ</option><option selected>Trung bình</option><option>Khó</option></select></div>' +
            '</div>' +
            '<label class="ex-lab">Nội dung câu hỏi</label><textarea class="ex-ta" id="exQText" style="min-height:76px" placeholder="Nhập nội dung câu hỏi…"></textarea>' +
            '<label class="ex-lab">Link hình ảnh (tùy chọn)</label><input class="ex-inp" id="exQImg" placeholder="Dán link ảnh hoặc link Google Drive…" oninput="EX.previewImg()">' +
            '<div class="ex-meta">Google Drive: chuột phải ảnh → Chia sẻ → “Bất kỳ ai có đường liên kết” → Sao chép liên kết → dán vào đây.</div>' +
            '<div id="exQImgPrev"></div>' +
            '<label class="ex-lab" style="color:var(--gr)">✓ Đáp án mẫu (chỉ Tổ Trưởng thấy)</label><textarea class="ex-ta" id="exQAns" style="min-height:60px" placeholder="Nhập đáp án đúng…"></textarea>' +
            '<div class="ex-actions">' +
              '<button class="abtn abtn-pu" onclick="EX.saveQ()">' + (this.editQ ? 'Lưu thay đổi' : '＋ Lưu câu hỏi') + '</button>' +
              (this.editQ ? '<button class="abtn abtn-ghost" onclick="EX.cancelQ()">Hủy sửa</button>' : '') +
              '<span class="ex-meta">Ngân hàng: <b>' + bank.length + '</b> câu</span>' +
            '</div>' +
          '</div>' +
          '<div class="sec-hdr pu">Ngân hàng câu hỏi <span class="cnt-badge">' + items.length + '</span></div>' +
          (items.length ? items.map(q => this.bankItemHtml(q)).join('') : '<div class="chart-card" style="text-align:center;color:var(--mu);font-size:.72rem">Chưa có câu hỏi nào trong chủ đề này.</div>') +
        '</div>' +
      '</div>';
    if (this.editQ) this.fillQForm();
  },
  pickTopic(id) { this.selTopic = id; this.render(); },
  bankItemHtml(q) {
    const t = this.topicById(q.topic);
    return '<div class="chart-card ex-bank' + (q.id === this.editQ ? ' editing' : '') + '">' +
      '<div class="ex-bankh">' +
        '<span class="ex-badge" style="background:' + hesc(t.color) + '22;color:' + hesc(t.color) + '" data-noi18n>' + hesc(t.name) + '</span>' +
        '<span class="ex-badge ex-b-mu">' + hesc(q.level || '') + '</span>' +
        '<span style="margin-left:auto;display:flex;gap:6px">' +
          '<button class="ex-mini" onclick="EX.pickQ(\'' + q.id + '\')" title="Sửa">✎</button>' +
          '<button class="ex-mini del" onclick="EX.delQ(\'' + q.id + '\')" title="Xóa">×</button>' +
        '</span>' +
      '</div>' +
      '<div class="ex-bankq" data-noi18n>' + hesc(q.question) + '</div>' +
      (q.imageUrl ? this.imgHtml(q.imageUrl, '220px') : '') +
      (q.answer ? '<div class="ex-correct"><b>✓ Đáp án:</b> <span data-noi18n>' + hesc(q.answer) + '</span></div>' : '') +
    '</div>';
  },
  previewImg() {
    const el = document.getElementById('exQImg'), pv = document.getElementById('exQImgPrev');
    if (pv) pv.innerHTML = el && el.value.trim() ? this.imgHtml(el.value.trim(), '320px') : '';
  },
  pickQ(id) { this.editQ = id; const q = this.D.bank.find(x => x.id === id); this._qt = q ? q.topic : null; this.render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  cancelQ() { this.editQ = null; this._qt = null; this.render(); },
  fillQForm() {
    const q = this.D.bank.find(x => x.id === this.editQ);
    if (!q) return;
    document.getElementById('exQTopic').value = q.topic;
    document.getElementById('exQLevel').value = q.level || 'Trung bình';
    document.getElementById('exQText').value = q.question || '';
    document.getElementById('exQImg').value = q.imageUrl || '';
    document.getElementById('exQAns').value = q.answer || '';
    this.previewImg();
  },
  async saveQ() {
    const o = {
      topic: document.getElementById('exQTopic').value,
      level: document.getElementById('exQLevel').value,
      question: document.getElementById('exQText').value.trim(),
      imageUrl: document.getElementById('exQImg').value.trim(),
      answer: document.getElementById('exQAns').value.trim()
    };
    if (!o.question) { alert('Vui lòng nhập nội dung câu hỏi.'); return; }
    if (!o.topic) { alert('Chưa có chủ đề nào — tạo chủ đề trước.'); return; }
    try {
      if (this.editQ) {
        o.id = this.editQ;
        const r = await this.call('updQ', o);
        Object.assign(this.D.bank.find(x => x.id === o.id), r);
        this.editQ = null; this._qt = null;
        this.toast('Đã sửa câu hỏi');
      } else {
        const r = await this.call('addQ', o);
        this.D.bank.push(r);
        this._qt = o.topic;
        this.toast('Đã lưu câu hỏi');
      }
      this.render();
      const el = document.getElementById('exQText'); if (el) el.focus();
    } catch (e) { alert('Lỗi lưu câu hỏi: ' + (e.message || e)); }
  },
  async delQ(id) {
    if (!confirm('Xóa câu hỏi này?')) return;
    try {
      await this.call('delQ', { id });
      this.D.bank = this.D.bank.filter(x => x.id !== id);
      if (this.editQ === id) this.editQ = null;
      this.render(); this.toast('Đã xóa câu hỏi');
    } catch (e) { alert('Lỗi xóa: ' + (e.message || e)); }
  },
  async setCfg(id, v, max) {
    v = Math.max(0, Math.min(parseInt(v) || 0, max));
    this.D.config[id] = v;
    try { await this.call('setCfg', { topicId: id, count: v }); this.render(); }
    catch (e) { alert('Lỗi lưu cấu trúc đề: ' + (e.message || e)); }
  },
  async saveSettings() {
    const d = parseInt(document.getElementById('exSetDur').value) || 45;
    const sa = document.getElementById('exSetAns').checked;
    try {
      await this.call('setSettings', { duration: d, showAnswerOnLookup: sa });
      this.D.settings = { duration: d, showAnswerOnLookup: sa };
      this.toast('Đã lưu cài đặt');
    } catch (e) { alert('Lỗi lưu cài đặt: ' + (e.message || e)); }
  },
  // ---- chủ đề (modal) ----
  openTopic(id) {
    this.editT = id;
    const t = id ? this.topicById(id) : { name: '', color: EX.COLORS[0] };
    this._tc = t.color || EX.COLORS[0];
    this.modal(
      '<div class="ex-modalh">' + (id ? 'Sửa chủ đề' : 'Thêm chủ đề mới') + '</div>' +
      '<label class="ex-lab">Tên chủ đề</label><input class="ex-inp" id="exTName" value="' + hesc(t.name) + '" placeholder="Ví dụ: Sảnh — Xổ số">' +
      '<label class="ex-lab">Màu nhận diện</label><div class="ex-swatch" id="exSwatch">' + this.swatchHtml() + '</div>' +
      '<div class="ex-actions"><button class="abtn abtn-pu" onclick="EX.saveTopic()">' + (id ? 'Lưu thay đổi' : 'Thêm') + '</button>' +
      '<button class="abtn abtn-ghost" onclick="EX.closeModal()">Đóng</button></div>', '380px');
  },
  COLORS: ['#7c3aed', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#f43f5e', '#a78bfa'],
  swatchHtml() { return this.COLORS.map(c => '<button style="background:' + c + '" class="' + (c === this._tc ? 'sel' : '') + '" onclick="EX.pickColor(\'' + c + '\')"></button>').join(''); },
  pickColor(c) { this._tc = c; document.getElementById('exSwatch').innerHTML = this.swatchHtml(); },
  async saveTopic() {
    const name = document.getElementById('exTName').value.trim();
    if (!name) { alert('Vui lòng nhập tên chủ đề.'); return; }
    try {
      if (this.editT) {
        const r = await this.call('updT', { id: this.editT, name, color: this._tc });
        Object.assign(this.topicById(this.editT), r);
        this.toast('Đã sửa chủ đề');
      } else {
        const r = await this.call('addT', { name, color: this._tc });
        this.D.topics.push(r); this.D.config[r.id] = 0;
        this.toast('Đã thêm chủ đề');
      }
      this.closeModal(); this.render();
    } catch (e) { alert('Lỗi lưu chủ đề: ' + (e.message || e)); }
  },
  async delTopic(id) {
    const cnt = this.D.bank.filter(b => b.topic === id).length;
    if (!confirm(cnt ? ('Chủ đề này có ' + cnt + ' câu hỏi, xóa sẽ mất luôn cả ' + cnt + ' câu. Tiếp tục?') : 'Xóa chủ đề này?')) return;
    try {
      await this.call('delT', { id });
      this.D.topics = this.D.topics.filter(t => t.id !== id);
      this.D.bank = this.D.bank.filter(b => b.topic !== id);
      delete this.D.config[id];
      if (this.selTopic === id) this.selTopic = null;
      this.render(); this.toast('Đã xóa chủ đề');
    } catch (e) { alert('Lỗi xóa chủ đề: ' + (e.message || e)); }
  },

  /* ==================== TAB: QUẢN LÝ NHÂN VIÊN (TT) ==================== */
  async renderNv(b) {
    if (!this.members) {
      b.innerHTML = '<div class="chart-card" style="text-align:center;color:var(--mu);font-size:.72rem">Đang tải danh sách tài khoản…</div>';
      try { this.members = await this.call('members'); } catch (e) { b.innerHTML = '<div class="chart-card" style="color:var(--re);font-size:.72rem">Lỗi: ' + hesc(e.message || e) + '</div>'; return; }
      if (this.view !== 'nv') return;
    }
    const rows = this.members.map((m, i) => {
      const zero = m.remaining <= 0;
      return '<tr>' +
        '<td class="ex-nm" data-noi18n>' + hesc(m.username || '(không tên)') + '</td>' +
        '<td>' + hesc(m.role === 'admin' ? 'Admin' : (m.role === 'totruong' ? 'Tổ Trưởng' : (m.role === 'nhanvien' ? 'Nhân viên' : m.role))) + '</td>' +
        '<td><button class="abtn abtn-sm ' + (m.examCfg ? 'abtn-cy' : 'abtn-ghost') + '" onclick="EX.openMemberCfg(' + i + ')">' + (m.examCfg ? 'Đề riêng' : 'Đề chung') + '</button></td>' +
        '<td><input class="ex-num' + (zero ? ' zero' : '') + '" type="number" min="0" id="exRem' + i + '" value="' + m.remaining + '"></td>' +
        '<td>' + m.used + '</td>' +
        '<td><button class="abtn abtn-sm abtn-pu" onclick="EX.saveMember(' + i + ')">Lưu</button> ' +
            '<button class="abtn abtn-sm abtn-ghost" onclick="EX.resetUsed(' + i + ')">Reset đã dùng</button></td>' +
      '</tr>';
    }).join('');
    b.innerHTML =
      '<div class="sec-hdr pu">Quản lý lượt test <span class="cnt-badge">' + this.members.length + '</span></div>' +
      '<div class="chart-card">' +
        '<div class="ex-meta" style="margin-bottom:10px">Danh sách lấy thẳng từ tài khoản đăng nhập của hệ thống — không phải gõ tay tên nhân viên.</div>' +
        '<div class="ex-meta" style="margin-bottom:10px">Ô Lượt còn lại tự giảm 1 mỗi lần bắt đầu bài; về 0 (ô đỏ) là hết lượt. Muốn cấp thêm thì gõ số mới rồi bấm Lưu.</div>' +
        '<div class="ex-tblwrap"><table class="ex-tbl">' +
          '<thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Cấu trúc đề</th><th>Lượt còn lại</th><th>Đã dùng</th><th>Thao tác</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div>' +
        '<div style="margin-top:12px"><button class="abtn abtn-ghost abtn-sm" onclick="EX.members=null;EX.render()">↻ Tải lại</button></div>' +
      '</div>';
  },
  async saveMember(i) {
    const m = this.members[i];
    const rem = parseInt(document.getElementById('exRem' + i).value) || 0;
    try { await this.call('saveMember', { user_id: m.user_id, username: m.username, remaining: rem }); m.remaining = rem; this.render(); this.toast('Đã lưu ' + m.username); }
    catch (e) { alert('Lỗi: ' + (e.message || e)); }
  },
  async resetUsed(i) {
    const m = this.members[i];
    if (!confirm('Đưa số lần "Đã dùng" của ' + m.username + ' về 0? (không đổi lượt còn lại)')) return;
    try { await this.call('resetUsed', { user_id: m.user_id, username: m.username }); m.used = 0; this.render(); this.toast('Đã reset'); }
    catch (e) { alert('Lỗi: ' + (e.message || e)); }
  },
  openMemberCfg(i) {
    const m = this.members[i];
    this._mi = i;
    const def = !m.examCfg;
    const list = (this.D.topics || []).map(t => {
      const avail = (this.D.bank || []).filter(x => x.topic === t.id).length;
      const val = m.examCfg ? (Number(m.examCfg[t.id]) || 0) : (this.D.config[t.id] || 0);
      return '<div class="ex-trow"><span class="ex-tdot" style="background:' + hesc(t.color) + '"></span>' +
        '<span class="ex-tname" data-noi18n>' + hesc(t.name) + '</span><span class="ex-tavail">/ ' + avail + ' câu</span>' +
        '<input type="number" class="ex-num ex-mcfg" min="0" max="' + avail + '" value="' + val + '" data-topic="' + hesc(t.id) + '" oninput="EX.mcfgTotal()"></div>';
    }).join('');
    this.modal(
      '<div class="ex-modalh">Cấu trúc đề riêng — <span data-noi18n>' + hesc(m.username) + '</span></div>' +
      '<div class="ex-meta">Đặt số câu mỗi chủ đề cho riêng người này (chủ đề yếu thì cho nhiều câu hơn). Tích “Đề chung” để dùng cấu trúc đề mặc định.</div>' +
      '<label class="ex-check"><input type="checkbox" id="exMcfgDef"' + (def ? ' checked' : '') + ' onchange="EX.mcfgToggle()"> <span>Đề chung — dùng cấu trúc đề mặc định</span></label>' +
      '<div id="exMcfgList" style="max-height:44vh;overflow:auto;margin-top:8px">' + list + '</div>' +
      '<div class="ex-meta" id="exMcfgTotal" style="margin-top:6px"></div>' +
      '<div class="ex-actions"><button class="abtn abtn-pu" onclick="EX.saveMemberCfg()">Lưu cấu trúc đề</button>' +
      '<button class="abtn abtn-ghost" onclick="EX.closeModal()">Đóng</button></div>', '460px');
    this.mcfgToggle(); this.mcfgTotal();
  },
  mcfgToggle() {
    const def = document.getElementById('exMcfgDef').checked;
    document.querySelectorAll('.ex-mcfg').forEach(i => { i.disabled = def; });
    document.getElementById('exMcfgList').style.opacity = def ? '.45' : '1';
  },
  mcfgTotal() {
    let t = 0;
    document.querySelectorAll('.ex-mcfg').forEach(i => { t += parseInt(i.value) || 0; });
    document.getElementById('exMcfgTotal').textContent = 'Tổng đề riêng: ' + t + ' câu';
  },
  async saveMemberCfg() {
    const m = this.members[this._mi];
    const useDefault = document.getElementById('exMcfgDef').checked;
    let cfg = {};
    if (!useDefault) document.querySelectorAll('.ex-mcfg').forEach(i => { const n = parseInt(i.value) || 0; if (n > 0) cfg[i.dataset.topic] = n; });
    try {
      await this.call('saveMemberCfg', { user_id: m.user_id, username: m.username, useDefault, cfg });
      m.examCfg = useDefault ? null : cfg;
      this.closeModal(); this.render(); this.toast('Đã lưu cấu trúc đề cho ' + m.username);
    } catch (e) { alert('Lỗi: ' + (e.message || e)); }
  },

  /* ==================== TAB: CHẤM ĐIỂM (TT) ==================== */
  async renderCham(b) {
    if (!this.subs) {
      b.innerHTML = '<div class="chart-card" style="text-align:center;color:var(--mu);font-size:.72rem">Đang tải danh sách bài…</div>';
      try { this.subs = await this.call('list'); } catch (e) { b.innerHTML = '<div class="chart-card" style="color:var(--re);font-size:.72rem">Lỗi: ' + hesc(e.message || e) + '</div>'; return; }
      if (this.view !== 'cham') return;
    }
    const wait = this.subs.filter(s => !s.graded).length;
    const rail = this.subs.map((s, i) =>
      '<div class="ex-srow' + (this.selSub === s.id ? ' on' : '') + '" onclick="EX.openSub(' + i + ')">' +
        '<div class="ex-srow-t"><b data-noi18n>' + hesc(s.username || '?') + '</b>' +
        (s.graded ? '<span class="ex-badge ex-b-ok">' + this.fmtScore(s.total) + '/' + s.count + '</span>' : '<span class="ex-badge ex-b-wait">Chờ chấm</span>') + '</div>' +
        '<div class="ex-meta" data-noi18n>' + hesc(s.id) + '</div>' +
        '<div class="ex-meta">' + this.fmtTime(s.time) + ' · ' + this.fmtDur(s.durationSec) + '</div>' +
      '</div>').join('');
    b.innerHTML =
      '<div class="ex-2col">' +
        '<div class="chart-card ex-rail">' +
          '<div class="ex-railh">Bài đã nộp <span class="cnt-badge">' + this.subs.length + '</span></div>' +
          (wait ? '<div class="ex-note ex-note-go" style="margin:0 0 10px">Còn ' + wait + ' bài chờ chấm</div>' : '') +
          (this.subs.length ? rail : '<div class="ex-meta">Chưa có bài nào được nộp.</div>') +
          '<button class="abtn abtn-ghost abtn-sm" style="margin-top:10px;width:100%;justify-content:center" onclick="EX.subs=null;EX.selSub=null;EX.render()">↻ Tải lại danh sách</button>' +
        '</div>' +
        '<div id="exGradePane">' + (this.selSub ? '' : '<div class="chart-card" style="text-align:center;color:var(--mu);font-size:.72rem">Chọn một bài bên trái để chấm.</div>') + '</div>' +
      '</div>';
    if (this.selSub) this.paintGrade();
  },
  async openSub(i) {
    const s = this.subs[i];
    this.selSub = s.id;
    this.render();
    const pane = document.getElementById('exGradePane');
    if (!s.items) {
      pane.innerHTML = '<div class="chart-card" style="text-align:center;color:var(--mu);font-size:.72rem">Đang tải nội dung bài…</div>';
      try { s.items = await this.call('sub', { sid: s.id }); }
      catch (e) { pane.innerHTML = '<div class="chart-card" style="color:var(--re);font-size:.72rem">Lỗi tải bài: ' + hesc(e.message || e) + '</div>'; return; }
      if (this.selSub !== s.id) return;
    }
    this.paintGrade();
  },
  paintGrade() {
    const s = this.subs.find(x => x.id === this.selSub);
    const pane = document.getElementById('exGradePane');
    if (!s || !pane) return;
    if (!s.items) return;
    const OPTS = [0, 0.25, 0.5, 0.75, 1];
    const body = s.items.map((it, i) => {
      const sc = (it.score !== '' && it.score != null) ? Number(it.score) : '';
      return '<div class="ex-rev">' +
        '<div class="ex-revq"><span class="ex-badge ex-b-mu" data-noi18n>' + hesc(it.topic) + '</span><span data-noi18n>' + hesc(it.question) + '</span></div>' +
        this.imgHtml(it.imageUrl, '460px') +
        '<div class="ex-reply"><b>Nhân viên trả lời:</b> ' + (it.reply ? '<span data-noi18n>' + hesc(it.reply) + '</span>' : '<i>(Bỏ trống)</i>') + '</div>' +
        (it.answer ? '<div class="ex-correct"><b>✓ Đáp án mẫu:</b> <span data-noi18n>' + hesc(it.answer) + '</span></div>' : '') +
        '<div class="ex-grow">' +
          '<select class="ex-inp ex-gsel" id="exGs' + i + '"><option value="">Chấm điểm</option>' +
            OPTS.map(v => '<option value="' + v + '"' + (sc !== '' && sc === v ? ' selected' : '') + '>' + v + ' điểm</option>').join('') +
          '</select>' +
          '<input class="ex-inp" id="exGn' + i + '" placeholder="Ghi chú (tùy chọn)…" value="' + hesc(it.note || '') + '">' +
        '</div>' +
      '</div>';
    }).join('');
    pane.innerHTML = '<div class="chart-card">' +
      '<div class="ex-railh">Bài của <span data-noi18n>' + hesc(s.username || '') + '</span> · <span data-noi18n>' + hesc(s.id) + '</span></div>' +
      '<div class="ex-meta">Mỗi câu tối đa 1 điểm — nhập được số lẻ. Tổng = cộng các câu / số câu.</div>' +
      '<div class="ex-meta" style="margin-bottom:10px">' + this.fmtTime(s.time) + ' · ' + this.fmtDur(s.durationSec) + ' · ' + s.count + ' câu</div>' +
      body +
      '<div class="ex-actions"><button class="abtn abtn-ok" onclick="EX.saveGrades()">Lưu chấm điểm</button>' +
      '<button class="abtn abtn-ghost" onclick="EX.selSub=null;EX.render()">Đóng</button></div>' +
    '</div>';
  },
  async saveGrades() {
    const s = this.subs.find(x => x.id === this.selSub);
    if (!s || !s.items) return;
    const grades = s.items.map((it, i) => ({
      score: document.getElementById('exGs' + i).value,
      note: document.getElementById('exGn' + i).value
    }));
    try {
      await this.call('grade', { sid: s.id, grades });
      s.items.forEach((it, i) => { it.score = grades[i].score === '' ? 0 : (Number(grades[i].score) || 0); it.note = grades[i].note; });
      s.total = s.items.reduce((a, it) => a + (Number(it.score) || 0), 0);
      s.graded = true;
      this.mine = null;                     // bài của chính mình có thể vừa được chấm
      logAction('CHẤM ĐIỂM TEST', (s.username || '') + ' · ' + s.id + ' · ' + this.fmtScore(s.total) + '/' + s.count);
      this.render(); this.toast('Đã lưu chấm điểm');
    } catch (e) { alert('Lỗi lưu chấm điểm: ' + (e.message || e)); }
  },

  /* ==================== XẾP HẠNG (dùng ở tab Xếp Hạng của T1) ==================== */
  // Mỗi người chỉ lấy BÀI TỐT NHẤT trong tháng -> làm nhiều lượt không tạo lợi thế.
  async renderRank(elId, month) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '<div class="chart-card" style="text-align:center;color:var(--mu);font-size:.72rem">Đang tải xếp hạng…</div>';
    try {
      const r = await this.call('rank', { month: month || 'all' });
      el.innerHTML = this.rankHtml(r.list || []);
    } catch (e) {
      el.innerHTML = '<div class="chart-card" style="color:var(--re);font-size:.72rem">Lỗi tải xếp hạng: ' + hesc(e.message || e) + '</div>';
    }
  },
  rankHtml(list) {
    if (!list.length) return '<div class="chart-card" style="text-align:center;color:var(--mu);font-size:.72rem">Chưa có bài test nào được chấm điểm trong kỳ này.</div>';
    const top = list.slice(0, 3), rest = list.slice(3);
    const ICON = ['🥇', '🥈', '🥉'];
    const slot = r => {
      const it = top[r];
      if (!it) return '<div class="pod-slot"></div>';
      const n = r + 1;
      return '<div class="pod-slot">' +
        '<div class="pod-icon pod' + n + '-icon">' + ICON[r] + '</div>' +
        '<div class="pod-name-frame pod' + n + '-frame">' +
          '<div class="pod-rank-badge pod' + n + '-badge">' + n + '</div>' +
          '<div class="pod-nm pod' + n + '-nm" data-noi18n>' + hesc(it.name || '?') + '</div>' +
          '<div class="pod-sc pod' + n + '-sc">' + this.fmtScore(it.total) + '/' + it.count + '</div>' +
          '<div class="pod-ct">' + Math.round(it.avg * 100) + '%</div>' +
        '</div>' +
        '<div class="pod-base pod' + n + '-base"></div>' +
      '</div>';
    };
    const restHtml = rest.length
      ? '<div class="chart-card" style="margin-top:16px"><div class="ex-tblwrap"><table class="ex-tbl">' +
        '<thead><tr><th>#</th><th>Tài khoản</th><th>Điểm</th><th>Tỷ lệ đúng</th><th>Ngày làm</th></tr></thead><tbody>' +
        rest.map((it, i) => '<tr><td>' + (i + 4) + '</td><td class="ex-nm" data-noi18n>' + hesc(it.name || '?') + '</td><td>' +
          this.fmtScore(it.total) + '/' + it.count + '</td><td>' + Math.round(it.avg * 100) + '%</td><td>' + this.fmtTime(it.time) + '</td></tr>').join('') +
        '</tbody></table></div></div>'
      : '';
    return '<div class="podium-row">' + slot(1) + slot(0) + slot(2) + '</div>' + restHtml;
  },

  /* ==================== MODAL CHUNG ==================== */
  modal(html, w) {
    const m = document.getElementById('exModal');
    const box = document.getElementById('exModalBox');
    box.style.maxWidth = w || '440px';
    box.innerHTML = html;
    m.classList.add('show');
  },
  closeModal() { const m = document.getElementById('exModal'); if (m) m.classList.remove('show'); }
};
// const X={} nằm ở global LEXICAL scope, KHÔNG có trên window -> phải phơi tường minh
// (đúng cái bẫy đã làm 2 ô OTP trượt âm thầm và i18n không thấy SOP).
window.EX = EX;
