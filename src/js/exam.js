// ===================== T5 — KIỂM TRA NGHIỆP VỤ =====================
// Dữ liệu nằm trong Supabase (bảng exam_*, xem supabase_exam_setup.sql).
//
// ⚠ Repo PUBLIC + dashboard chạy bằng anon key -> KHÔNG tin frontend. Bảo mật do
// RLS + RPC ở tầng Postgres quyết định, không phải do code trong file này:
//   • Nhân viên KHÔNG có quyền SELECT trên exam_questions/submissions/answers.
//     Họ chỉ gọi được các RPC exam_* (SECURITY DEFINER) — đề trả về đã cắt bỏ
//     đáp án mẫu, và số lượt/điểm do server ghi.
//   • Tổ Trưởng trở lên mới đọc ghi thẳng các bảng (dùng cho 3 tab quản lý).
// Vì vậy ẩn nút ở đây chỉ là cho gọn mắt; chặn thật nằm trong SQL.
//
// Khóa dữ liệu theo user_id (UUID) chứ không theo tên: đổi tên tài khoản vẫn giữ
// nguyên lịch sử test (bài học từ vụ CHAMY -> SOLIS ở bảng bất thường).
const EX = {
  VIEWS: [
    { k: 'lam',  t: 'Làm Bài' },
    { k: 'bai',  t: 'Bài Của Tôi' },
    { k: 'de',   t: 'Quản Lý Đề', tt: 1 },
    { k: 'nv',   t: 'Quản Lý Nhân Viên', tt: 1 },
    { k: 'cham', t: 'Chấm Điểm', tt: 1 }
  ],
  view: 'lam',
  D: null,          // {topics,config,settings,me,pending}
  bank: null,       // ngân hàng câu hỏi — CHỈ tải khi là Tổ Trưởng trở lên
  loading: false,
  stage: 'intro',   // intro | doing | done
  run: null,        // bài đang làm: {id,code,duration,t0,questions,answers,cur}
  tmr: null,
  subs: null, mine: null, members: null,
  editQ: null, editT: null, selTopic: null, selSub: null, _qt: null,

  canEdit() { const r = CUR_PROFILE ? roleOf(CUR_PROFILE) : null; return !!(CUR_PROFILE && (CUR_PROFILE.is_admin || (r && r.key === 'totruong'))); },

  // ---------- gọi Supabase ----------
  async rpc(fn, args) {
    if (!SB.ready()) throw new Error('Chưa cấu hình cloud');
    const { data, error } = await SB.client().rpc(fn, args || {});
    if (error) throw new Error(error.message || 'Lỗi máy chủ');
    return data;
  },
  tbl(name) { return SB.client().from(name); },

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
      this.D = await this.rpc('exam_boot');
      if (this.canEdit()) await this.loadBank();
      this.loading = false;
      this.renderViews();
      this.render();
    } catch (e) {
      this.loading = false;
      if (body) body.innerHTML = '<div class="chart-card" style="color:var(--re);font-size:.72rem">Lỗi tải dữ liệu: ' + hesc(e.message || e) +
        '<div style="color:var(--mu);margin-top:8px;font-weight:400">Nếu báo không tìm thấy hàm <b>exam_boot</b>: bạn chưa chạy file <b>supabase_exam_setup.sql</b> trong SQL Editor của Supabase.</div></div>';
    }
  },
  async loadBank() {
    // Cột song ngữ do supabase_exam_i18n.sql tạo. CHƯA chạy file SQL đó thì Postgres
    // báo "column ... does not exist" và cả tab chết -> tự lùi về bộ cột cũ, tab vẫn
    // chạy bình thường (chỉ không có bản EN). Cờ _noI18nCols để ẩn phần bản dịch.
    let { data, error } = await this.tbl('exam_questions')
      .select('id,topic_id,level,question,image_url,answer,active,en_question,en_answer,en_image_url,envi_question,envi_answer')
      .eq('active', true).order('created_at');
    if (error && /en_question|en_answer|en_image_url|envi_/.test(error.message || '')) {
      this._noI18nCols = true;
      ({ data, error } = await this.tbl('exam_questions')
        .select('id,topic_id,level,question,image_url,answer,active')
        .eq('active', true).order('created_at'));
    }
    if (error) throw new Error(error.message);
    this.bank = data || [];
  },

  // ---------- tiện ích ----------
  topicById(id) { return (this.D.topics || []).find(t => t.id === id) || { id: id, name: '(đã xóa)', color: '#64748b' }; },

  /* ---------- SONG NGỮ NỘI DUNG ĐỀ ----------
     Giống hệt cách làm ở T4: bản tiếng Việt nằm ở cột gốc, bản tiếng Anh ở cột
     `en_<field>` (thiếu thì RƠI VỀ tiếng Việt, nên câu chưa dịch vẫn đọc được).
     Cột `envi_<field>` giữ dấu vết bản VI lúc dịch -> biết bản dịch đã cũ chưa.
     ⚠ Ô soạn câu hỏi LUÔN ghi vào bản tiếng Việt, kể cả khi giao diện đang bật
     EN — đúng cái bẫy đã làm hỏng 3 bảng ở T4 ngày 24/08/2026 (nhập bản dịch ghi
     đè thẳng lên bản gốc, mất hẳn tiếng Việt). Bản EN chỉ vào bằng file dịch. */
  en() { return typeof I18N !== 'undefined' && I18N.lang === 'en'; },
  tx(o, f) { const e = o && o['en_' + f]; return (e && this.en()) ? e : ((o && o[f]) || ''); },
  // ảnh: có ảnh riêng bản EN thì dùng khi đang bật EN
  imgOf(o, f) { f = f || 'image_url'; const e = o && o['en_' + f]; return (e && this.en()) ? e : ((o && o[f]) || ''); },
  isStale(o, f) { const en = o && o['en_' + f], cu = o && o['envi_' + f]; return !!(en && cu && cu !== (o[f] || '')); },

  fmtScore(n) { n = Number(n) || 0; return Number.isInteger(n) ? String(n) : n.toFixed(2); },
  fmtDur(sec) { sec = Number(sec) || 0; return Math.floor(sec / 60) + ' phút ' + (sec % 60) + ' giây'; },
  fmtTime(t) {
    if (!t) return '';
    const d = new Date(t);
    if (isNaN(d.getTime())) return String(t);
    const p = n => String(n).padStart(2, '0');
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  },
  /* ---------- ẢNH CÂU HỎI ----------
     Cơ chế y hệt tab Quy Trình Làm Việc: bucket PRIVATE `baitest`, nén WebP ngay
     trên trình duyệt rồi tải thẳng lên, hiển thị bằng signed URL 1 giờ có cache
     trong RAM. Người soạn KHÔNG phải dán link.
     `image_url` giờ chứa ĐƯỜNG DẪN trong bucket (vd 'q/p1a2b3c4.webp'); các giá
     trị cũ dạng http(s) vẫn hiển thị bình thường (dán hàng loạt từ Excel vẫn
     nhận link) — imgHtml tự phân biệt. */
  BUCKET: 'baitest',
  _urls: {},
  uid(p) { return (p || 'p') + Math.random().toString(36).slice(2, 10); },
  // Link Google Drive -> link ảnh hiển thị được (chỉ còn dùng cho ô dán hàng loạt)
  normImg(url) {
    if (!url) return '';
    url = String(url).trim();
    if (url.indexOf('drive.google.com') > -1 || url.indexOf('docs.google.com') > -1) {
      const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/) || url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/) || url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
      if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1200';
    }
    return url;
  },
  imgHtml(src, max) {
    if (!src) return '';
    const isUrl = /^https?:\/\//i.test(src);
    const attr = isUrl ? ('src="' + hesc(src) + '"') : ('data-p="' + hesc(src) + '"');
    return '<div class="ex-img"' + (max ? ' style="max-width:' + max + '"' : '') + '><img ' + attr +
      ' loading="lazy" onclick="EX.lightbox(this.src)" title="Bấm để phóng to"' +
      ' onerror="this.parentNode.innerHTML=\'<span class=&quot;ex-imgerr&quot;>Không tải được ảnh.</span>\'"></div>';
  },
  // Nén: tối đa 1920px, WebP 0.85 (~120-250 KB/ảnh chụp màn hình, chữ vẫn sắc)
  compress(file) {
    return new Promise((res, rej) => {
      if (!/^image\//.test(file.type)) { rej(new Error('Không phải file ảnh')); return; }
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1920, sc = Math.min(1, MAX / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => b ? res(b) : rej(new Error('Nén ảnh lỗi')), 'image/webp', .85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Không đọc được ảnh')); };
      img.src = url;
    });
  },
  async signed(path) {
    if (this._urls[path] && this._urls[path].exp > Date.now()) return this._urls[path].u;
    const { data, error } = await SB.client().storage.from(this.BUCKET).createSignedUrl(path, 3600);
    if (error || !data) { this._urlErr = error && (error.message || error); return ''; }
    this._urls[path] = { u: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 };
    return data.signedUrl;
  },
  // Ký URL cho mọi <img data-p> vừa render (gọi sau render, giống SOP.hydrateImgs)
  async hydrateImgs() {
    for (const el of [...document.querySelectorAll('#t5 img[data-p]')]) {
      const p = el.getAttribute('data-p');
      const u = await this.signed(p);
      if (u) { el.src = u; el.removeAttribute('data-p'); }
      else if (el.parentNode) {
        console.warn('[EX] không ký được URL ảnh:', p, this._urlErr);
        el.parentNode.innerHTML = '<span class="ex-imgerr">Không tải được ảnh — file có thể đã bị xóa khỏi kho.</span>';
      }
    }
  },
  lightbox(src) {
    if (!src) return;
    this.modal('<div class="ex-lb"><img src="' + hesc(src) + '" alt=""></div>' +
      '<div class="ex-actions" style="justify-content:flex-end">' +
      '<a class="abtn abtn-ghost" href="' + hesc(src) + '" target="_blank" rel="noopener" style="text-decoration:none">Mở ảnh gốc</a>' +
      '<button class="abtn abtn-pu" onclick="EX.closeModal()">Đóng</button></div>', '94vw');
  },
  // Tải 1 ảnh lên bucket, trả về đường dẫn đã lưu
  async uploadImg(file) {
    const blob = await this.compress(file);
    const path = 'q/' + this.uid('p') + '.webp';
    const { error } = await SB.client().storage.from(this.BUCKET).upload(path, blob, { contentType: 'image/webp', upsert: false });
    if (error) throw new Error(error.message);
    return path;
  },
  /* ⚠ CHỈ xoá ảnh của câu hỏi CHƯA lưu (vừa tải nhầm rồi đổi/bỏ ngay).
     Ảnh của câu hỏi ĐÃ lưu thì TUYỆT ĐỐI KHÔNG xoá, kể cả khi sửa hay xoá câu
     hỏi đó: mọi bài nhân viên đã nộp trước đó vẫn trỏ tới đúng file ảnh này
     (exam_answers.image_url là bản chụp lúc bốc đề). Xoá file = bài cũ hiện
     "Không tải được ảnh" — đã dính đúng lỗi này ngày 28/08/2026.
     Ảnh mồ côi chỉ tốn ~200 KB, đổi lại lịch sử chấm điểm không bao giờ vỡ. */
  async dropImg(path) {
    if (!path || /^https?:\/\//i.test(path)) return;   // link ngoài thì không có gì để xoá
    try { await SB.client().storage.from(this.BUCKET).remove([path]); } catch (e) { console.warn('xoá ảnh', e); }
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
    // .tab = kích cỡ chuẩn dùng chung với T1/T2/T3/T4 (xem chú thích ở .tab trong styles.css)
    el.innerHTML = list.map(v => '<div class="tab' + (this.view === v.k ? ' active' : '') + '" onclick="EX.setView(\'' + v.k + '\')">' + v.t + '</div>').join('');
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
    else if (this.view === 'de') { this.renderDe(b); this.wireDrop(); }
    else if (this.view === 'nv') this.renderNv(b);
    else if (this.view === 'cham') this.renderCham(b);
    this.hydrateImgs();   // ký URL cho ảnh vừa render (các hàm async tự gọi lại)
  },

  /* ==================== TAB: LÀM BÀI ==================== */
  renderLam(b) {
    if (this.stage === 'doing') { this.renderDoing(b); return; }
    if (this.stage === 'done') { this.renderDone(b); return; }
    const me = this.D.me, st = this.D.settings, cfg = me.exam_cfg || this.D.config || {};
    const total = Object.keys(cfg).reduce((a, k) => a + (Number(cfg[k]) || 0), 0);
    const chips = (this.D.topics || []).filter(t => (cfg[t.id] || 0) > 0).map(t =>
      '<div class="ex-chip"><div class="ex-chip-n" style="color:' + hesc(t.color) + '">' + (cfg[t.id] || 0) + '</div><div class="ex-chip-l" data-noi18n>' + hesc(String(this.tx(t, 'name')).replace(/^(Sảnh|Lobby)\s*—\s*/, '')) + '</div></div>').join('');
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
          (me.exam_cfg ? '<div class="ex-note ex-note-go">Bạn đang dùng <b>đề riêng</b> do Tổ Trưởng thiết lập.</div>' : '') +
          (pend ? '<div class="ex-note ex-note-go">Bạn có một bài <b>đang làm dở</b> <span>(' + pend.count + ' câu, bắt đầu ' + Math.floor((pend.elapsed || 0) / 60) + ' phút trước). Bấm nút dưới để làm tiếp — không tốn thêm lượt.</span></div>' : '') +
          '<div class="ex-meta">Tài khoản: <b data-noi18n>' + hesc((CUR_PROFILE && CUR_PROFILE.username) || '') + '</b> · Lượt còn lại: <b class="' + (me.remaining > 0 ? 'ex-ok' : 'ex-bad') + '">' + me.remaining + '</b> · Đã làm: <b>' + me.used + '</b> lần</div>' +
          (me.remaining <= 0 && !pend ? '<div class="ex-note ex-note-re">Bạn đã hết lượt làm bài. Liên hệ Tổ Trưởng để được cấp thêm.</div>' : '') +
          '<div style="margin-top:16px"><button class="abtn abtn-pu" id="exStartBtn" onclick="EX.start()"' + ((me.remaining <= 0 && !pend) ? ' disabled' : '') + '>' + (pend ? 'Làm tiếp bài dở →' : 'Bắt đầu làm bài →') + '</button></div>' +
        '</div>' +
      '</div>';
  },
  async start() {
    const btn = document.getElementById('exStartBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang chuẩn bị đề…'; }
    try {
      const r = await this.rpc('exam_start');
      const draft = this.draftGet(r.code);
      // Mốc hết giờ suy từ `elapsed` (giây, do SERVER tính) — không parse chuỗi thời
      // gian phía client: máy nhân viên lệch múi giờ là đồng hồ sai / báo hết giờ ngay.
      this.run = {
        id: r.id, code: r.code, duration: r.duration,
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
  draftKey(code) { return 'ex_draft_' + code; },
  draftGet(code) { try { return JSON.parse(localStorage.getItem(this.draftKey(code)) || 'null'); } catch (e) { return null; } },
  draftSave() { try { localStorage.setItem(this.draftKey(this.run.code), JSON.stringify(this.run.answers)); } catch (e) {} },
  draftClear(code) { try { localStorage.removeItem(this.draftKey(code)); } catch (e) {} },

  renderDoing(b) {
    const r = this.run, q = r.questions[r.cur];
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
          '<span class="ex-badge ex-b-mu" data-noi18n>' + hesc(this.tx(q, 'topic')) + '</span>' +
          '<div class="ex-q" data-noi18n>' + hesc(this.tx(q, 'question')) + '</div>' +
          this.imgHtml(this.imgOf(q)) +
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
  goQ(i) { if (i < 0 || i >= this.run.questions.length) return; this.saveCur(); this.run.cur = i; this.render(); },
  next() {
    this.saveCur();
    if (this.run.cur < this.run.questions.length - 1) { this.run.cur++; this.render(); }
    else this.submit();
  },
  startTimer() { clearInterval(this.tmr); this.tmr = setInterval(() => this.paintTimer(), 1000); },
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
    const snap = { code: this.run.code, count: this.run.questions.length, filled: this.run.answers.filter(a => a && a.trim()).length, dur: dur };
    try {
      await this.rpc('exam_submit', { p_id: this.run.id, p_answers: this.run.answers, p_duration: dur });
      this.draftClear(this.run.code);
      this.D.pending = null;
      this.mine = null; this.subs = null;
      this.stage = 'done'; this.doneInfo = snap; this.run = null;
      this.render();
    } catch (e) {
      alert('Nộp bài không thành công: ' + (e.message || e) + '\n\nCâu trả lời của bạn vẫn được giữ — kiểm tra mạng rồi bấm Nộp bài lại.');
      if (!auto) this.startTimer();
    }
  },
  renderDone(b) {
    const d = this.doneInfo || { count: 0, filled: 0, dur: 0, code: '' };
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
        '<div class="ex-meta" style="margin-top:14px">Mã bài: <b data-noi18n>' + hesc(d.code) + '</b></div>' +
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
      try { this.mine = await this.rpc('exam_my_list'); } catch (e) { b.innerHTML = '<div class="chart-card" style="color:var(--re);font-size:.72rem">Lỗi: ' + hesc(e.message || e) + '</div>'; return; }
      if (this.view !== 'bai') return;
    }
    const res = this.mine;
    if (!res.submissions.length) { b.innerHTML = '<div class="chart-card" style="text-align:center;color:var(--mu);font-size:.72rem">Bạn chưa có bài test nào.</div>'; return; }
    b.innerHTML = '<div class="sec-hdr pu">Bài đã nộp <span class="cnt-badge">' + res.submissions.length + '</span></div>' +
      res.submissions.map((s, i) => {
        const badge = s.graded
          ? '<span class="ex-badge ex-b-ok">Đã chấm · ' + this.fmtScore(s.total) + '/' + s.count + '</span>'
          : '<span class="ex-badge ex-b-wait">Chờ chấm</span>';
        return '<div class="chart-card ex-subcard" style="margin-bottom:10px">' +
          '<div class="ex-subh" onclick="EX.toggleMine(' + i + ')">' +
            '<div><div class="ex-subt" data-noi18n>' + hesc(s.code) + '</div>' +
            '<div class="ex-meta">' + this.fmtTime(s.time) + ' · ' + this.fmtDur(s.duration_sec) + ' · ' + s.count + ' câu</div></div>' + badge +
          '</div><div id="exMine' + i + '" style="display:none"></div></div>';
      }).join('') +
      (res.show_answer ? '' : '<div class="ex-meta" style="margin-top:10px">Đáp án mẫu đang được ẩn. Tổ Trưởng có thể bật trong Quản Lý Đề → Cài đặt bài thi.</div>');
    this.hydrateImgs();
  },
  toggleMine(i) {
    const box = document.getElementById('exMine' + i);
    if (box.style.display !== 'none') { box.style.display = 'none'; return; }
    const s = this.mine.submissions[i];
    box.innerHTML = (s.items || []).map(it => {
      const has = it.score !== '' && it.score != null;
      return '<div class="ex-rev">' +
        '<div class="ex-revq"><span class="ex-badge ex-b-mu" data-noi18n>' + hesc(this.tx(it, 'topic')) + '</span><span data-noi18n>' + hesc(this.tx(it, 'question')) + '</span></div>' +
        this.imgHtml(this.imgOf(it), '420px') +
        '<div class="ex-reply"><b>Bạn trả lời:</b> ' + (it.reply ? '<span data-noi18n>' + hesc(it.reply) + '</span>' : '<i>(Bỏ trống)</i>') + '</div>' +
        (it.answer ? '<div class="ex-correct"><b>✓ Đáp án mẫu:</b> <span data-noi18n>' + hesc(this.tx(it, 'answer')) + '</span></div>' : '') +
        (has ? '<div class="ex-meta">Điểm câu: <b>' + this.fmtScore(it.score) + '</b>' + (it.note ? ' · <span data-noi18n>' + hesc(it.note) + '</span>' : '') + '</div>' : '') +
      '</div>';
    }).join('');
    box.style.display = 'block';
    this.hydrateImgs();
  },

  /* ==================== TAB: QUẢN LÝ ĐỀ (TT) ==================== */
  renderDe(b) {
    const st = this.D.settings, topics = this.D.topics || [], bank = this.bank || [];
    const total = Object.values(this.D.config || {}).reduce((a, v) => a + (Number(v) || 0), 0);
    // Mỗi chủ đề chiếm 2 dòng: trên là TÊN ĐẦY ĐỦ (không cắt), dưới là ô số câu +
    // 2 nút. Nhồi cả 6 thứ vào 1 dòng như bản đầu làm tên chủ đề bị cắt cụt.
    const rail = topics.map(t => {
      const avail = bank.filter(x => x.topic_id === t.id).length;
      const cur = (this.D.config || {})[t.id] || 0;
      return '<div class="ex-trow2' + (this.selTopic === t.id ? ' on' : '') + '" onclick="EX.pickTopic(\'' + t.id + '\')">' +
        '<div class="ex-trow2-t"><span class="ex-tdot" style="background:' + hesc(t.color) + '"></span>' +
        '<span class="ex-tname" data-noi18n>' + hesc(this.tx(t, 'name')) + '</span></div>' +
        '<div class="ex-trow2-b" onclick="event.stopPropagation()">' +
          '<input type="number" class="ex-num" min="0" max="' + avail + '" value="' + cur + '" onchange="EX.setCfg(\'' + t.id + '\',this.value,' + avail + ')" title="Số câu bốc vào đề">' +
          '<span class="ex-tavail">/ ' + avail + ' câu có sẵn</span>' +
          '<button class="ex-mini" onclick="EX.openTopic(\'' + t.id + '\')" title="Sửa">✎</button>' +
          '<button class="ex-mini del" onclick="EX.delTopic(\'' + t.id + '\')" title="Xóa">×</button>' +
        '</div>' +
      '</div>';
    }).join('');
    const items = bank.filter(x => this.selTopic ? x.topic_id === this.selTopic : true);
    b.innerHTML =
      '<div class="ex-2col ex-2col-wide">' +
        '<div class="chart-card ex-rail">' +
          '<div class="ex-railh">Chủ đề &amp; số câu <span class="cnt-badge">' + total + '</span></div>' +
          '<div class="ex-trow2' + (this.selTopic ? '' : ' on') + '" onclick="EX.pickTopic(null)">' +
            '<div class="ex-trow2-t"><span class="ex-tdot" style="background:var(--mu)"></span><span class="ex-tname">Tất cả chủ đề</span></div>' +
            '<div class="ex-trow2-b"><span class="ex-tavail">' + bank.length + ' câu trong ngân hàng</span></div>' +
          '</div>' +
          rail +
          '<button class="abtn abtn-pu abtn-sm" style="margin-top:10px;width:100%;justify-content:center" onclick="EX.openTopic(null)">＋ Thêm chủ đề</button>' +
          '<div class="ex-railh" style="margin-top:18px">Cài đặt bài thi</div>' +
          '<label class="ex-lab">Thời gian làm bài (phút)</label>' +
          '<input class="ex-inp" type="number" id="exSetDur" min="1" max="240" value="' + (st.duration || 45) + '">' +
          '<label class="ex-check"><input type="checkbox" id="exSetAns"' + (st.show_answer ? ' checked' : '') + '> <span>Cho nhân viên xem đáp án mẫu khi tra cứu bài cũ</span></label>' +
          '<button class="abtn abtn-ok abtn-sm" style="margin-top:10px;width:100%;justify-content:center" onclick="EX.saveSettings()">Lưu cài đặt</button>' +
        '</div>' +
        '<div>' +
          '<div class="chart-card" style="margin-bottom:14px">' +
            '<div class="ex-railh">' + (this.editQ ? 'Sửa câu hỏi' : 'Thêm câu hỏi vào ngân hàng') +
              (this.editQ ? '' : '<button class="abtn abtn-ghost abtn-sm" style="margin-left:auto" onclick="EX.openPaste()">📋 Dán hàng loạt từ Excel</button>') + '</div>' +
            // ô soạn LUÔN ghi bản tiếng Việt — bản EN chỉ vào bằng file dịch (xem chú thích ở tx())
            (this.en() ? '<div class="ex-meta" style="color:var(--go)">Ô soạn dưới đây luôn ghi bản tiếng Việt, kể cả khi giao diện đang bật EN. Bản tiếng Anh nhập bằng nút Nhập bản dịch.</div>' : '') +
            '<div class="ex-frow">' +
              '<div style="flex:2;min-width:180px"><label class="ex-lab">Chủ đề</label><select class="ex-inp" id="exQTopic">' + topics.map(t => '<option value="' + hesc(t.id) + '"' + (this._qt === t.id ? ' selected' : '') + ' data-noi18n>' + hesc(this.tx(t, 'name')) + '</option>').join('') + '</select></div>' +
              '<div style="flex:1;min-width:130px"><label class="ex-lab">Độ khó</label><select class="ex-inp" id="exQLevel"><option>Dễ</option><option selected>Trung bình</option><option>Khó</option></select></div>' +
            '</div>' +
            '<label class="ex-lab">Nội dung câu hỏi</label><textarea class="ex-ta" id="exQText" style="min-height:76px" placeholder="Nhập nội dung câu hỏi…"></textarea>' +
            '<label class="ex-lab">Hình ảnh minh họa (tùy chọn)</label>' +
            '<div id="exQImgBox">' + this.imgBoxHtml() + '</div>' +
            '<input type="file" id="exQImgFile" accept="image/*" style="display:none" onchange="EX.onImgFile(this.files)">' +
            '<label class="ex-lab" style="color:var(--gr)">✓ Đáp án mẫu (chỉ Tổ Trưởng thấy)</label><textarea class="ex-ta" id="exQAns" style="min-height:60px" placeholder="Nhập đáp án đúng…"></textarea>' +
            '<div class="ex-actions">' +
              '<button class="abtn abtn-pu" onclick="EX.saveQ()">' + (this.editQ ? 'Lưu thay đổi' : '＋ Lưu câu hỏi') + '</button>' +
              (this.editQ ? '<button class="abtn abtn-ghost" onclick="EX.cancelQ()">Hủy sửa</button>' : '') +
              '<span class="ex-meta">Ngân hàng: <b>' + bank.length + '</b> câu</span>' +
            '</div>' +
          '</div>' +
          (this._noI18nCols
            ? '<div class="chart-card" style="margin-bottom:14px;color:var(--go);font-size:.72rem">Chưa bật phần song ngữ: hãy chạy file <b>supabase_exam_i18n.sql</b> trong SQL Editor của Supabase rồi tải lại trang.</div>'
            : '<div class="chart-card" style="margin-bottom:14px">' +
            '<div class="ex-railh">Bản dịch tiếng Anh' +
              '<span style="margin-left:auto;display:flex;gap:8px">' +
                '<button class="abtn abtn-ghost abtn-sm" onclick="EX.exportTrans()">Xuất nội dung</button>' +
                '<button class="abtn abtn-ghost abtn-sm" onclick="EX.importTrans()">Nhập bản dịch</button>' +
              '</span></div>' +
            '<div class="ex-meta">Xuất ra file JSON gồm tên chủ đề, câu hỏi và đáp án mẫu; dịch phần “en” rồi nhập ngược lại. Câu chưa dịch vẫn hiện tiếng Việt khi bật EN. Ảnh riêng cho bản EN thì tải trực tiếp ở từng câu bên dưới.</div>' +
            '<div class="ex-meta" style="margin-top:6px">Chưa dịch: <b>' + bank.filter(q => !q.en_question).length + '</b> câu · Bản dịch đã cũ: <b>' + bank.filter(q => this.isStale(q, 'question') || this.isStale(q, 'answer')).length + '</b> câu</div>' +
            '<input type="file" id="exTransFile" accept=".json,application/json" style="display:none" onchange="EX.onTransFile(this)">' +
            '<input type="file" id="exEnImgFile" accept="image/*" style="display:none" onchange="EX.onEnImgFile(this.files)">' +
          '</div>') +
          // Lọc theo chủ đề ngay tại tiêu đề: dùng CÙNG biến selTopic với cột trái nên
          // bấm chủ đề bên trái hay chọn ở đây đều cho cùng kết quả.
          '<div class="sec-hdr pu">Ngân hàng câu hỏi <span class="cnt-badge">' + items.length + '</span>' +
            '<select class="ex-inp ex-filter" onchange="EX.pickTopic(this.value||null)" title="Lọc theo chủ đề">' +
              '<option value=""' + (this.selTopic ? '' : ' selected') + '>Tất cả chủ đề (' + bank.length + ')</option>' +
              topics.map(t => '<option value="' + hesc(t.id) + '"' + (this.selTopic === t.id ? ' selected' : '') + ' data-noi18n>' +
                hesc(this.tx(t, 'name')) + ' (' + bank.filter(x => x.topic_id === t.id).length + ')</option>').join('') +
            '</select>' +
          '</div>' +
          (items.length ? items.map(q => this.bankItemHtml(q)).join('') : '<div class="chart-card" style="text-align:center;color:var(--mu);font-size:.72rem">Chưa có câu hỏi nào trong chủ đề này.</div>') +
        '</div>' +
      '</div>';
    if (this.editQ) this.fillQForm();
  },
  pickTopic(id) { this.selTopic = id; this.render(); },
  bankItemHtml(q) {
    const t = this.topicById(q.topic_id);
    const stale = this.isStale(q, 'question') || this.isStale(q, 'answer');
    const trans = this._noI18nCols ? '' : q.en_question
      ? (stale ? '<span class="ex-badge ex-b-wait">Bản dịch đã cũ</span>' : '<span class="ex-badge ex-b-ok">Đã dịch</span>')
      : '<span class="ex-badge ex-b-mu">Chưa dịch</span>';
    const showEn = this.en() && q.en_image_url;
    return '<div class="chart-card ex-bank' + (q.id === this.editQ ? ' editing' : '') + '">' +
      '<div class="ex-bankh">' +
        '<span class="ex-badge" style="background:' + hesc(t.color) + '22;color:' + hesc(t.color) + '" data-noi18n>' + hesc(this.tx(t, 'name')) + '</span>' +
        '<span class="ex-badge ex-b-mu">' + hesc(q.level || '') + '</span>' + trans +
        '<span style="margin-left:auto;display:flex;gap:6px">' +
          '<button class="ex-mini" onclick="EX.pickQ(\'' + q.id + '\')" title="Sửa">✎</button>' +
          '<button class="ex-mini del" onclick="EX.delQ(\'' + q.id + '\')" title="Xóa">×</button>' +
        '</span>' +
      '</div>' +
      '<div class="ex-bankq" data-noi18n>' + hesc(this.tx(q, 'question')) + '</div>' +
      (this.imgOf(q) ? this.imgHtml(this.imgOf(q), '220px') : '') +
      (showEn ? '<div class="ex-meta" style="color:var(--cy)">Đang xem: ảnh bản EN</div>' : '') +
      (this._noI18nCols ? '' : '<div class="ex-imgb" style="margin-top:6px">' +
        (q.en_image_url
          ? '<button class="abtn abtn-ghost abtn-sm" onclick="EX.pickEnImg(\'' + q.id + '\')">Đổi ảnh EN</button>' +
            '<button class="abtn abtn-danger abtn-sm" onclick="EX.clearEnImg(\'' + q.id + '\')">Xoá ảnh EN</button>'
          : '<button class="abtn abtn-ghost abtn-sm" onclick="EX.pickEnImg(\'' + q.id + '\')">＋ Ảnh bản EN</button>') +
      '</div>') +
      (this.tx(q, 'answer') ? '<div class="ex-correct"><b>✓ Đáp án:</b> <span data-noi18n>' + hesc(this.tx(q, 'answer')) + '</span></div>' : '') +
    '</div>';
  },
  /* ---- khu vực ảnh trong ô soạn câu hỏi ----
     Kéo thả · bấm chọn · dán ảnh chụp màn hình (Ctrl+V) — không dán link. */
  imgBoxHtml() {
    if (this._qimg) {
      return '<div class="ex-imgone">' + this.imgHtml(this._qimg, '260px') +
        '<div class="ex-imgb"><button class="abtn abtn-ghost abtn-sm" onclick="EX.pickImg()">Đổi ảnh</button>' +
        '<button class="abtn abtn-danger abtn-sm" onclick="EX.clearImg()">Xóa ảnh</button></div></div>';
    }
    return '<div class="ex-drop" id="exQDrop" onclick="EX.pickImg()">' +
      '<b>Kéo ảnh vào đây, dán ảnh chụp màn hình (Ctrl+V), hoặc bấm để chọn file</b>' +
      '<span>Ảnh được nén còn tối đa 1920px rồi lưu thẳng lên hệ thống — không cần link.</span></div>';
  },
  refreshImgBox() {
    const el = document.getElementById('exQImgBox');
    if (!el) return;
    el.innerHTML = this.imgBoxHtml();
    this.wireDrop();
    this.hydrateImgs();
  },
  wireDrop() {
    const d = document.getElementById('exQDrop');
    if (!d) return;
    d.addEventListener('dragover', e => { e.preventDefault(); d.classList.add('over'); });
    d.addEventListener('dragleave', () => d.classList.remove('over'));
    d.addEventListener('drop', e => { e.preventDefault(); d.classList.remove('over'); EX.onImgFile(e.dataTransfer.files); });
  },
  pickImg() { const f = document.getElementById('exQImgFile'); if (f) { f.value = ''; f.click(); } },
  async onImgFile(files) {
    if (!files || !files.length) return;
    const box = document.getElementById('exQImgBox');
    if (box) box.innerHTML = '<div class="ex-drop"><b>Đang tải ảnh lên…</b></div>';
    try {
      const path = await this.uploadImg(files[0]);
      const old = this._qimg;
      this._qimg = path;
      // chỉ dọn ảnh vừa tải nhầm của câu hỏi CHƯA lưu; đang sửa câu hỏi cũ thì giữ
      // nguyên ảnh cũ vì các bài đã nộp còn trỏ tới nó
      if (old && !this.editQ) await this.dropImg(old);
      this.refreshImgBox();
    } catch (e) {
      alert('Tải ảnh thất bại: ' + (e.message || e));
      this.refreshImgBox();
    }
  },
  async clearImg() {
    const old = this._qimg;
    this._qimg = '';
    this.refreshImgBox();
    if (old && !this.editQ) await this.dropImg(old);   // xem chú thích ở dropImg
  },
  /* ---- ẢNH RIÊNG CHO BẢN EN ----
     Ảnh chụp màn hình giao diện tiếng Anh: hiện thay ảnh gốc khi người xem bật EN
     (EX.imgOf), thiếu thì vẫn dùng ảnh tiếng Việt.
     ⚠ Cùng luật an toàn với ảnh gốc: KHÔNG xoá file trên kho khi đổi/gỡ ảnh của
     câu hỏi đã lưu — mọi bài đã nộp còn trỏ tới đúng file đó (exam_answers giữ
     bản chụp). Chỉ gỡ liên kết trong ngân hàng câu hỏi. */
  pickEnImg(id) {
    this._enTarget = id;
    const f = document.getElementById('exEnImgFile');
    if (f) { f.value = ''; f.click(); }
  },
  async onEnImgFile(files) {
    const id = this._enTarget;
    if (!files || !files.length || !id) return;
    this.toast('Đang tải ảnh lên…');
    try {
      const path = await this.uploadImg(files[0]);
      const { error } = await this.tbl('exam_questions').update({ en_image_url: path }).eq('id', id);
      if (error) throw new Error(error.message);
      const q = this.bank.find(x => x.id === id); if (q) q.en_image_url = path;
      this._enTarget = null;
      this.render(); this.toast('Đã lưu ảnh bản EN');
    } catch (e) { this._enTarget = null; alert('Tải ảnh thất bại: ' + (e.message || e)); }
  },
  async clearEnImg(id) {
    if (!confirm('Gỡ ảnh bản EN của câu hỏi này? Bản tiếng Anh sẽ dùng lại ảnh gốc.')) return;
    try {
      const { error } = await this.tbl('exam_questions').update({ en_image_url: null }).eq('id', id);
      if (error) throw new Error(error.message);
      const q = this.bank.find(x => x.id === id); if (q) q.en_image_url = null;
      this.render(); this.toast('Đã gỡ ảnh bản EN');
    } catch (e) { alert('Lỗi gỡ ảnh: ' + (e.message || e)); }
  },

  /* ---- XUẤT / NHẬP BẢN DỊCH (JSON, cùng khuôn với T4) ----
     Xuất: gom tên chủ đề + câu hỏi + đáp án mẫu kèm cờ `stale` (bản VI đã sửa sau
     lần dịch trước). Nhập: chỉ ghi vào cột en_* và envi_*, TUYỆT ĐỐI không đụng
     cột tiếng Việt — đây đúng là chỗ T4 từng ghi đè mất bản gốc. */
  exportTrans() {
    if (!this.canEdit()) return;
    const row = (o, f, p) => ({ p: p, vi: o[f] || '', en: o['en_' + f] || '', stale: this.isStale(o, f) });
    const out = { v: 1, at: new Date().toISOString(), topics: [], questions: [] };
    (this.D.topics || []).forEach(t => {
      if (!(t.name || '').trim()) return;
      out.topics.push({ id: t.id, rows: [row(t, 'name', 'name')] });
    });
    (this.bank || []).forEach(q => {
      const rows = [row(q, 'question', 'question')];
      if ((q.answer || '').trim()) rows.push(row(q, 'answer', 'answer'));
      out.questions.push({ id: q.id, topic: this.topicById(q.topic_id).name, level: q.level || '', rows: rows });
    });
    const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'de_kiem_tra_nghiep_vu_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  importTrans() { if (this.canEdit()) { const f = document.getElementById('exTransFile'); if (f) { f.value = ''; f.click(); } } },
  async onTransFile(inp) {
    const f = (inp.files || [])[0]; inp.value = '';
    if (!f || !this.canEdit()) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch (e) { alert('Không đọc được file: ' + (e.message || e)); return; }
    if (!data || (!Array.isArray(data.topics) && !Array.isArray(data.questions))) { alert('Sai định dạng: file thiếu danh sách topics/questions.'); return; }
    // gom bản dịch thành payload update, bỏ qua dòng chưa dịch
    const patch = (rec, src) => {
      const o = {};
      (rec.rows || []).forEach(r => {
        if (!r.en || !String(r.en).trim() || !/^(name|question|answer)$/.test(r.p || '')) return;
        o['en_' + r.p] = r.en;
        o['envi_' + r.p] = src ? (src[r.p] || '') : (r.vi || '');   // dấu vết bản VI lúc dịch
      });
      return o;
    };
    let nT = 0, nQ = 0, nS = 0;
    try {
      for (const rec of (data.topics || [])) {
        const t = (this.D.topics || []).find(x => x.id === rec.id); if (!t) continue;
        const o = patch(rec, t); if (!Object.keys(o).length) continue;
        const { error } = await this.tbl('exam_topics').update(o).eq('id', t.id);
        if (error) throw new Error(error.message);
        Object.assign(t, o); nT++; nS += Object.keys(o).length / 2;
      }
      for (const rec of (data.questions || [])) {
        const q = (this.bank || []).find(x => x.id === rec.id); if (!q) continue;
        const o = patch(rec, q); if (!Object.keys(o).length) continue;
        const { error } = await this.tbl('exam_questions').update(o).eq('id', q.id);
        if (error) throw new Error(error.message);
        Object.assign(q, o); nQ++; nS += Object.keys(o).length / 2;
      }
    } catch (e) { alert('Lỗi nhập bản dịch: ' + (e.message || e)); this.render(); return; }
    this.render();
    this.toast('Đã nhập bản dịch: ' + nQ + ' câu hỏi, ' + nT + ' chủ đề');
    logAction('NHẬP BẢN DỊCH ĐỀ TEST', nS + ' chuỗi · ' + nQ + ' câu · ' + nT + ' chủ đề');
  },

  pickQ(id) {
    this.editQ = id;
    const q = this.bank.find(x => x.id === id);
    this._qt = q ? q.topic_id : null;
    this._qimg = q ? (q.image_url || '') : '';
    this.render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  cancelQ() { this.editQ = null; this._qt = null; this._qimg = ''; this.render(); },
  fillQForm() {
    const q = this.bank.find(x => x.id === this.editQ);
    if (!q) return;
    document.getElementById('exQTopic').value = q.topic_id;
    document.getElementById('exQLevel').value = q.level || 'Trung bình';
    document.getElementById('exQText').value = q.question || '';
    document.getElementById('exQAns').value = q.answer || '';
  },
  async saveQ() {
    const o = {
      topic_id: document.getElementById('exQTopic').value,
      level: document.getElementById('exQLevel').value,
      question: document.getElementById('exQText').value.trim(),
      image_url: this._qimg || '',
      answer: document.getElementById('exQAns').value.trim()
    };
    if (!o.question) { alert('Vui lòng nhập nội dung câu hỏi.'); return; }
    if (!o.topic_id) { alert('Chưa có chủ đề nào — tạo chủ đề trước.'); return; }
    try {
      if (this.editQ) {
        const { error } = await this.tbl('exam_questions').update(o).eq('id', this.editQ);
        if (error) throw new Error(error.message);
        Object.assign(this.bank.find(x => x.id === this.editQ), o);
        this.editQ = null; this._qt = null; this._qimg = '';
        this.toast('Đã sửa câu hỏi');
      } else {
        const { data, error } = await this.tbl('exam_questions').insert(o).select().single();
        if (error) throw new Error(error.message);
        this.bank.push(data);
        this._qt = o.topic_id; this._qimg = '';
        this.toast('Đã lưu câu hỏi');
      }
      this.render();
      const el = document.getElementById('exQText'); if (el) el.focus();
    } catch (e) { alert('Lỗi lưu câu hỏi: ' + (e.message || e)); }
  },
  async delQ(id) {
    if (!confirm('Xóa câu hỏi này?')) return;
    try {
      const { error } = await this.tbl('exam_questions').delete().eq('id', id);
      if (error) throw new Error(error.message);
      // KHÔNG xoá ảnh: bài đã nộp trước đó vẫn hiển thị câu hỏi này kèm ảnh
      this.bank = this.bank.filter(x => x.id !== id);
      if (this.editQ === id) this.editQ = null;
      this.render(); this.toast('Đã xóa câu hỏi');
    } catch (e) { alert('Lỗi xóa: ' + (e.message || e)); }
  },
  async setCfg(id, v, max) {
    v = Math.max(0, Math.min(parseInt(v) || 0, max));
    this.D.config[id] = v;
    try {
      const { error } = await this.tbl('exam_config').upsert({ topic_id: id, count: v }, { onConflict: 'topic_id' });
      if (error) throw new Error(error.message);
      this.render();
    } catch (e) { alert('Lỗi lưu cấu trúc đề: ' + (e.message || e)); }
  },
  async saveSettings() {
    const d = parseInt(document.getElementById('exSetDur').value) || 45;
    const sa = document.getElementById('exSetAns').checked;
    try {
      const { error } = await this.tbl('exam_settings').upsert([
        { key: 'duration', value: String(d) },
        { key: 'show_answer', value: sa ? 'yes' : 'no' }
      ], { onConflict: 'key' });
      if (error) throw new Error(error.message);
      this.D.settings = { duration: d, show_answer: sa };
      this.toast('Đã lưu cài đặt');
    } catch (e) { alert('Lỗi lưu cài đặt: ' + (e.message || e)); }
  },

  /* ---- DÁN HÀNG LOẠT TỪ EXCEL ----
     Giữ lại cái tiện duy nhất của bảng tính: nhập 100 câu bằng cách dán một lần,
     thay vì gõ từng câu qua giao diện. */
  openPaste() {
    this.modal(
      '<div class="ex-modalh">Dán hàng loạt từ Excel</div>' +
      '<div class="ex-meta">Bôi đen vùng dữ liệu trong Excel/Google Sheet rồi Ctrl+C, bấm vào ô dưới và Ctrl+V. Mỗi dòng là một câu hỏi, các cột cách nhau bằng Tab (đúng thứ tự):</div>' +
      '<div class="ex-meta" style="margin-top:6px"><b>Chủ đề · Độ khó · Câu hỏi · Đáp án mẫu · Link ảnh</b> — hai cột cuối để trống cũng được.</div>' +
      '<div class="ex-meta" style="margin-top:6px">Chủ đề chưa có trong hệ thống sẽ được tạo mới tự động.</div>' +
      '<textarea class="ex-ta" id="exPasteTa" style="min-height:180px;margin-top:10px;font-family:monospace;font-size:.68rem" placeholder="Tự luận nghiệp vụ&#9;Trung bình&#9;Khách rút 200k chưa đủ vòng cược?&#9;Từ chối và giải thích điều kiện." data-noi18n></textarea>' +
      '<div class="ex-meta" id="exPasteInfo" style="margin-top:6px"></div>' +
      '<div class="ex-actions"><button class="abtn abtn-pu" onclick="EX.runPaste()">Nhập vào ngân hàng</button>' +
      '<button class="abtn abtn-ghost" onclick="EX.closeModal()">Đóng</button></div>', '640px');
    const ta = document.getElementById('exPasteTa');
    ta.addEventListener('input', () => {
      const n = EX.parsePaste(ta.value).length;
      document.getElementById('exPasteInfo').textContent = n ? ('Đọc được ' + n + ' câu hỏi') : '';
    });
    setTimeout(() => ta.focus(), 50);
  },
  parsePaste(txt) {
    const LV = { 'dễ': 'Dễ', 'de': 'Dễ', 'trung bình': 'Trung bình', 'trung binh': 'Trung bình', 'khó': 'Khó', 'kho': 'Khó' };
    return String(txt || '').split(/\r?\n/).map(line => {
      const c = line.split('\t');
      if (c.length < 3) return null;
      const topic = (c[0] || '').trim(), question = (c[2] || '').trim();
      if (!topic || !question) return null;
      return {
        topic: topic,
        level: LV[(c[1] || '').trim().toLowerCase()] || 'Trung bình',
        question: question,
        answer: (c[3] || '').trim(),
        image_url: this.normImg((c[4] || '').trim())
      };
    }).filter(Boolean);
  },
  async runPaste() {
    const rows = this.parsePaste(document.getElementById('exPasteTa').value);
    if (!rows.length) { alert('Không đọc được dòng nào. Cần ít nhất 3 cột: Chủ đề · Độ khó · Câu hỏi, cách nhau bằng Tab.'); return; }
    // Chủ đề chưa có -> tạo mới (khớp tên không phân biệt hoa/thường)
    const byName = {};
    (this.D.topics || []).forEach(t => { byName[t.name.trim().toLowerCase()] = t.id; });
    const missing = [...new Set(rows.map(r => r.topic).filter(t => !byName[t.trim().toLowerCase()]))];
    if (!confirm('Nhập ' + rows.length + ' câu hỏi vào ngân hàng?' + (missing.length ? ('\n\nSẽ tạo mới ' + missing.length + ' chủ đề: ' + missing.join(', ')) : ''))) return;
    try {
      if (missing.length) {
        const { data, error } = await this.tbl('exam_topics')
          .insert(missing.map((n, i) => ({ name: n, color: this.COLORS[i % this.COLORS.length] }))).select();
        if (error) throw new Error(error.message);
        (data || []).forEach(t => { this.D.topics.push(t); byName[t.name.trim().toLowerCase()] = t.id; this.D.config[t.id] = 0; });
        await this.tbl('exam_config').upsert((data || []).map(t => ({ topic_id: t.id, count: 0 })), { onConflict: 'topic_id' });
      }
      const payload = rows.map(r => ({
        topic_id: byName[r.topic.trim().toLowerCase()], level: r.level,
        question: r.question, answer: r.answer, image_url: r.image_url
      }));
      const { data, error } = await this.tbl('exam_questions').insert(payload).select();
      if (error) throw new Error(error.message);
      (data || []).forEach(q => this.bank.push(q));
      this.closeModal(); this.render();
      this.toast('Đã nhập ' + (data || []).length + ' câu hỏi');
      logAction('NHẬP CÂU HỎI TEST', (data || []).length + ' câu');
    } catch (e) { alert('Lỗi nhập hàng loạt: ' + (e.message || e)); }
  },

  // ---- chủ đề (modal) ----
  COLORS: ['#7c3aed', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#f43f5e', '#a78bfa'],
  openTopic(id) {
    this.editT = id;
    const t = id ? this.topicById(id) : { name: '', color: this.COLORS[0] };
    this._tc = t.color || this.COLORS[0];
    this.modal(
      '<div class="ex-modalh">' + (id ? 'Sửa chủ đề' : 'Thêm chủ đề mới') + '</div>' +
      '<label class="ex-lab">Tên chủ đề</label><input class="ex-inp" id="exTName" value="' + hesc(t.name) + '" placeholder="Ví dụ: Sảnh — Xổ số">' +
      '<label class="ex-lab">Màu nhận diện</label><div class="ex-swatch" id="exSwatch">' + this.swatchHtml() + '</div>' +
      '<div class="ex-actions"><button class="abtn abtn-pu" onclick="EX.saveTopic()">' + (id ? 'Lưu thay đổi' : 'Thêm') + '</button>' +
      '<button class="abtn abtn-ghost" onclick="EX.closeModal()">Đóng</button></div>', '380px');
  },
  swatchHtml() { return this.COLORS.map(c => '<button style="background:' + c + '" class="' + (c === this._tc ? 'sel' : '') + '" onclick="EX.pickColor(\'' + c + '\')"></button>').join(''); },
  pickColor(c) { this._tc = c; document.getElementById('exSwatch').innerHTML = this.swatchHtml(); },
  async saveTopic() {
    const name = document.getElementById('exTName').value.trim();
    if (!name) { alert('Vui lòng nhập tên chủ đề.'); return; }
    try {
      if (this.editT) {
        const { error } = await this.tbl('exam_topics').update({ name, color: this._tc }).eq('id', this.editT);
        if (error) throw new Error(error.message);
        Object.assign(this.topicById(this.editT), { name, color: this._tc });
        this.toast('Đã sửa chủ đề');
      } else {
        const { data, error } = await this.tbl('exam_topics').insert({ name, color: this._tc }).select().single();
        if (error) throw new Error(error.message);
        this.D.topics.push(data); this.D.config[data.id] = 0;
        await this.tbl('exam_config').upsert({ topic_id: data.id, count: 0 }, { onConflict: 'topic_id' });
        this.toast('Đã thêm chủ đề');
      }
      this.closeModal(); this.render();
    } catch (e) { alert('Lỗi lưu chủ đề: ' + (e.message || e)); }
  },
  async delTopic(id) {
    const cnt = (this.bank || []).filter(b => b.topic_id === id).length;
    if (!confirm(cnt ? ('Chủ đề này có ' + cnt + ' câu hỏi, xóa sẽ mất luôn cả ' + cnt + ' câu. Tiếp tục?') : 'Xóa chủ đề này?')) return;
    try {
      const { error } = await this.tbl('exam_topics').delete().eq('id', id);   // câu hỏi + cấu trúc đề xóa theo (on delete cascade)
      if (error) throw new Error(error.message);
      this.D.topics = this.D.topics.filter(t => t.id !== id);
      this.bank = this.bank.filter(b => b.topic_id !== id);
      delete this.D.config[id];
      if (this.selTopic === id) this.selTopic = null;
      this.render(); this.toast('Đã xóa chủ đề');
    } catch (e) { alert('Lỗi xóa chủ đề: ' + (e.message || e)); }
  },

  /* ==================== TAB: QUẢN LÝ NHÂN VIÊN (TT) ==================== */
  async renderNv(b) {
    if (!this.members) {
      b.innerHTML = '<div class="chart-card" style="text-align:center;color:var(--mu);font-size:.72rem">Đang tải danh sách tài khoản…</div>';
      try { this.members = await this.rpc('exam_members_list'); } catch (e) { b.innerHTML = '<div class="chart-card" style="color:var(--re);font-size:.72rem">Lỗi: ' + hesc(e.message || e) + '</div>'; return; }
      if (this.view !== 'nv') return;
    }
    const rows = this.members.map((m, i) => {
      const zero = m.remaining <= 0;
      return '<tr>' +
        '<td class="ex-nm" data-noi18n>' + hesc(m.username || '(không tên)') + '</td>' +
        '<td>' + (m.role === 'admin' ? 'Admin' : (m.role === 'totruong' ? 'Tổ Trưởng' : 'Nhân viên')) + '</td>' +
        '<td><button class="abtn abtn-sm ' + (m.exam_cfg ? 'abtn-cy' : 'abtn-ghost') + '" onclick="EX.openMemberCfg(' + i + ')">' + (m.exam_cfg ? 'Đề riêng' : 'Đề chung') + '</button></td>' +
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
    try {
      const { error } = await this.tbl('exam_members').upsert({ user_id: m.user_id, remaining: rem, used: m.used, exam_cfg: m.exam_cfg }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
      m.remaining = rem; this.render(); this.toast('Đã lưu ' + m.username);
      logAction('CẤP LƯỢT TEST', (m.username || '') + ' · còn ' + rem + ' lượt');
    } catch (e) { alert('Lỗi: ' + (e.message || e)); }
  },
  async resetUsed(i) {
    const m = this.members[i];
    if (!confirm('Đưa số lần "Đã dùng" của ' + m.username + ' về 0? (không đổi lượt còn lại)')) return;
    try {
      const { error } = await this.tbl('exam_members').upsert({ user_id: m.user_id, remaining: m.remaining, used: 0, exam_cfg: m.exam_cfg }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
      m.used = 0; this.render(); this.toast('Đã reset');
    } catch (e) { alert('Lỗi: ' + (e.message || e)); }
  },
  openMemberCfg(i) {
    const m = this.members[i];
    this._mi = i;
    const def = !m.exam_cfg;
    const list = (this.D.topics || []).map(t => {
      const avail = (this.bank || []).filter(x => x.topic_id === t.id).length;
      const val = m.exam_cfg ? (Number(m.exam_cfg[t.id]) || 0) : ((this.D.config || {})[t.id] || 0);
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
    let cfg = null;
    if (!useDefault) {
      cfg = {};
      document.querySelectorAll('.ex-mcfg').forEach(i => { const n = parseInt(i.value) || 0; if (n > 0) cfg[i.dataset.topic] = n; });
    }
    try {
      const { error } = await this.tbl('exam_members').upsert({ user_id: m.user_id, remaining: m.remaining, used: m.used, exam_cfg: cfg }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
      m.exam_cfg = cfg;
      this.closeModal(); this.render(); this.toast('Đã lưu cấu trúc đề cho ' + m.username);
    } catch (e) { alert('Lỗi: ' + (e.message || e)); }
  },

  /* ==================== TAB: CHẤM ĐIỂM (TT) ==================== */
  async renderCham(b) {
    if (!this.subs) {
      b.innerHTML = '<div class="chart-card" style="text-align:center;color:var(--mu);font-size:.72rem">Đang tải danh sách bài…</div>';
      try { this.subs = await this.rpc('exam_list'); } catch (e) { b.innerHTML = '<div class="chart-card" style="color:var(--re);font-size:.72rem">Lỗi: ' + hesc(e.message || e) + '</div>'; return; }
      if (this.view !== 'cham') return;
    }
    const wait = this.subs.filter(s => !s.graded).length;
    const rail = this.subs.map((s, i) =>
      '<div class="ex-srow' + (this.selSub === s.id ? ' on' : '') + '" onclick="EX.openSub(' + i + ')">' +
        '<div class="ex-srow-t"><b data-noi18n>' + hesc(s.username || '?') + '</b>' +
        (s.graded ? '<span class="ex-badge ex-b-ok">' + this.fmtScore(s.total) + '/' + s.count + '</span>' : '<span class="ex-badge ex-b-wait">Chờ chấm</span>') + '</div>' +
        '<div class="ex-meta" data-noi18n>' + hesc(s.code) + '</div>' +
        '<div class="ex-srow-f"><span class="ex-meta">' + this.fmtTime(s.time) + ' · ' + this.fmtDur(s.duration_sec) + '</span>' +
        '<button class="ex-mini del" onclick="event.stopPropagation();EX.delSub(' + i + ')" title="Xóa bài này">×</button></div>' +
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
      try {
        let { data, error } = await this.tbl('exam_answers')
          .select('idx,topic_name,question,image_url,sample_answer,reply,score,note,en_topic_name,en_question,en_image_url,en_sample_answer')
          .eq('submission_id', s.id).order('idx');
        if (error && /en_/.test(error.message || '')) {   // chưa chạy supabase_exam_i18n.sql
          ({ data, error } = await this.tbl('exam_answers')
            .select('idx,topic_name,question,image_url,sample_answer,reply,score,note')
            .eq('submission_id', s.id).order('idx'));
        }
        if (error) throw new Error(error.message);
        s.items = data || [];
      } catch (e) { pane.innerHTML = '<div class="chart-card" style="color:var(--re);font-size:.72rem">Lỗi tải bài: ' + hesc(e.message || e) + '</div>'; return; }
      if (this.selSub !== s.id) return;
    }
    this.paintGrade();
  },
  paintGrade() {
    const s = this.subs.find(x => x.id === this.selSub);
    const pane = document.getElementById('exGradePane');
    if (!s || !pane || !s.items) return;
    const OPTS = [0, 0.25, 0.5, 0.75, 1];
    const body = s.items.map((it, i) => {
      const sc = (it.score !== '' && it.score != null) ? Number(it.score) : '';
      return '<div class="ex-rev">' +
        '<div class="ex-revq"><span class="ex-badge ex-b-mu" data-noi18n>' + hesc(this.tx(it, 'topic_name')) + '</span><span data-noi18n>' + hesc(this.tx(it, 'question')) + '</span></div>' +
        this.imgHtml(this.imgOf(it), '460px') +
        '<div class="ex-reply"><b>Nhân viên trả lời:</b> ' + (it.reply ? '<span data-noi18n>' + hesc(it.reply) + '</span>' : '<i>(Bỏ trống)</i>') + '</div>' +
        (it.sample_answer ? '<div class="ex-correct"><b>✓ Đáp án mẫu:</b> <span data-noi18n>' + hesc(this.tx(it, 'sample_answer')) + '</span></div>' : '') +
        '<div class="ex-grow">' +
          '<select class="ex-inp ex-gsel" id="exGs' + i + '"><option value="">Chấm điểm</option>' +
            OPTS.map(v => '<option value="' + v + '"' + (sc !== '' && sc === v ? ' selected' : '') + '>' + v + ' điểm</option>').join('') +
          '</select>' +
          '<input class="ex-inp" id="exGn' + i + '" placeholder="Ghi chú (tùy chọn)…" value="' + hesc(it.note || '') + '">' +
        '</div>' +
      '</div>';
    }).join('');
    pane.innerHTML = '<div class="chart-card">' +
      '<div class="ex-railh">Bài của <span data-noi18n>' + hesc(s.username || '') + '</span> · <span data-noi18n>' + hesc(s.code) + '</span></div>' +
      '<div class="ex-meta">Mỗi câu tối đa 1 điểm — nhập được số lẻ. Tổng = cộng các câu / số câu.</div>' +
      '<div class="ex-meta" style="margin-bottom:10px">' + this.fmtTime(s.time) + ' · ' + this.fmtDur(s.duration_sec) + ' · ' + s.count + ' câu</div>' +
      body +
      '<div class="ex-actions"><button class="abtn abtn-ok" onclick="EX.saveGrades()">Lưu chấm điểm</button>' +
      '<button class="abtn abtn-ghost" onclick="EX.selSub=null;EX.render()">Đóng</button>' +
      '<button class="abtn abtn-danger" style="margin-left:auto" onclick="EX.delSub(' + this.subs.indexOf(s) + ')">Xóa bài này</button></div>' +
    '</div>';
    this.hydrateImgs();
  },
  /* Xóa hẳn 1 bài đã nộp (Tổ Trưởng trở lên) — dùng khi dọn bài test thử, bài nộp
     nhầm, hoặc bài của tài khoản đã nghỉ. Câu trả lời xóa theo (cascade) và bài
     biến mất khỏi xếp hạng. KHÔNG hoàn lượt test đã trừ — muốn cấp lại thì vào
     tab Quản Lý Nhân Viên gõ số lượt mới. */
  async delSub(i) {
    const s = this.subs[i];
    if (!s) return;
    if (!confirm('Xóa hẳn bài ' + s.code + ' của ' + (s.username || '?') + '?\n\nMọi câu trả lời và điểm đã chấm của bài này sẽ mất, bài cũng biến mất khỏi bảng xếp hạng. Không hoàn tác được.\n\nLượt test đã trừ KHÔNG được hoàn lại — muốn cấp thêm thì vào tab Quản Lý Nhân Viên.')) return;
    try {
      await this.rpc('exam_delete', { p_id: s.id });
      logAction('XÓA BÀI TEST', (s.username || '') + ' · ' + s.code);
      this.subs.splice(i, 1);
      if (this.selSub === s.id) this.selSub = null;
      this.mine = null;
      this.render(); this.toast('Đã xóa bài ' + s.code);
    } catch (e) { alert('Lỗi xóa bài: ' + (e.message || e)); }
  },
  async saveGrades() {
    const s = this.subs.find(x => x.id === this.selSub);
    if (!s || !s.items) return;
    const grades = s.items.map((it, i) => ({
      score: document.getElementById('exGs' + i).value,
      note: document.getElementById('exGn' + i).value
    }));
    try {
      await this.rpc('exam_grade', { p_id: s.id, p_grades: grades });
      s.items.forEach((it, i) => { it.score = grades[i].score === '' ? null : Number(grades[i].score); it.note = grades[i].note; });
      s.total = s.items.reduce((a, it) => a + (Number(it.score) || 0), 0);
      s.graded = s.items.some(it => it.score != null);
      this.mine = null;                     // bài của chính mình có thể vừa được chấm
      logAction('CHẤM ĐIỂM TEST', (s.username || '') + ' · ' + s.code + ' · ' + this.fmtScore(s.total) + '/' + s.count);
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
      const list = await this.rpc('exam_rank', { p_month: month || 'all' });
      el.innerHTML = this.rankHtml(list || []);
    } catch (e) {
      el.innerHTML = '<div class="chart-card" style="color:var(--re);font-size:.72rem">Lỗi tải xếp hạng: ' + hesc(e.message || e) + '</div>';
    }
  },
  /* Ảnh cúp "TOP 3 XUẤT SẮC" dùng CHUNG với bảng vinh danh của T1 (shift-rank.js):
     một ảnh nền, tên 3 người đặt tuyệt đối theo % nên co giãn theo bề ngang.
     Toạ độ 3 chỗ đặt tên lấy y hệt mkTrophyRow — đổi ảnh thì phải chỉnh cả 2 nơi.
     Điểm/tỷ lệ KHÔNG in lên ảnh: top 3 nằm ngay 3 dòng đầu của bảng (có huy chương
     + tô nền theo hạng) để so sánh cùng cột với những người còn lại. */
  RANK_IMG: 'https://media.88new11.com/public/new88/site-tong/8d45f036-33ce-42e4-86c7-6b4174a6e109.png',
  RANK_SLOT: [
    { i: 1, l: '18%',   t: '68%', c: '#c4b5fd', fs: 'clamp(1rem,3.2vw,1.5rem)' },
    { i: 0, l: '50.8%', t: '67%', c: '#fbbf24', fs: 'clamp(1.3rem,4.2vw,1.95rem)' },
    { i: 2, l: '83%',   t: '68%', c: '#93c5fd', fs: 'clamp(1rem,3.2vw,1.5rem)' }
  ],
  rankHtml(list) {
    if (!list.length) return '<div class="chart-card" style="text-align:center;color:var(--mu);font-size:.72rem">Chưa có bài test nào được chấm điểm trong kỳ này.</div>';
    const ov = this.RANK_SLOT.map(s => {
      const it = list[s.i];
      if (!it) return '';
      const stroke = '-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff,0 0 10px ' + s.c;
      return '<div style="position:absolute;left:' + s.l + ';top:' + s.t + ';transform:translate(-50%,-50%);text-align:center">' +
        '<div data-noi18n style="color:' + s.c + ';font-weight:900;font-size:' + s.fs + ';text-shadow:' + stroke +
        ';letter-spacing:1px;white-space:nowrap">' + hesc(it.name || '?') + '</div></div>';
    }).join('');
    const podium = '<div style="position:relative;border-radius:12px;overflow:hidden">' +
      '<img src="' + this.RANK_IMG + '" style="width:100%;display:block" loading="lazy" alt="">' + ov + '</div>';
    const rows = list.map((it, i) =>
      '<tr' + (i < 3 ? ' class="ex-top' + (i + 1) + '"' : '') + '>' +
        '<td class="ex-rk">Hạng ' + (i + 1) + '</td>' +
        '<td class="ex-nm" data-noi18n>' + hesc(it.name || '?') + '</td>' +
        '<td>' + this.fmtScore(it.total) + '/' + it.count + '</td>' +
        '<td>' + Math.round(it.avg * 100) + '%</td>' +
        '<td>' + this.fmtTime(it.time) + '</td>' +
      '</tr>').join('');
    return podium +
      '<div class="chart-card" style="margin-top:16px"><div class="ex-tblwrap"><table class="ex-tbl">' +
      '<thead><tr><th>#</th><th>Tài khoản</th><th>Điểm</th><th>Tỷ lệ đúng</th><th>Ngày làm</th></tr></thead><tbody>' +
      rows + '</tbody></table></div></div>';
  },

  /* ==================== MODAL CHUNG ==================== */
  modal(html, w) {
    const box = document.getElementById('exModalBox');
    box.style.maxWidth = w || '440px';
    box.innerHTML = html;
    document.getElementById('exModal').classList.add('show');
  },
  closeModal() { const m = document.getElementById('exModal'); if (m) m.classList.remove('show'); }
};
// const X={} nằm ở global LEXICAL scope, KHÔNG có trên window -> phải phơi tường minh
// (đúng cái bẫy đã làm 2 ô OTP trượt âm thầm và i18n không thấy SOP).
window.EX = EX;

// Dán ảnh chụp màn hình thẳng vào ô soạn câu hỏi (Ctrl+V) — tiện nhất khi ra đề.
// Chỉ nhận khi ĐANG ở tab T5 / màn Quản Lý Đề và clipboard có FILE ảnh, nên không
// cướp sự kiện dán của Đơn Rút (T1) / NTK (T3), cũng không cản dán chữ vào textarea.
document.addEventListener('paste', e => {
  const t5 = document.getElementById('t5');
  if (!t5 || t5.style.display === 'none' || EX.view !== 'de' || !EX.canEdit()) return;
  const files = e.clipboardData && e.clipboardData.files;
  if (!files || !files.length || !/^image\//.test(files[0].type)) return;
  e.preventDefault();
  EX.onImgFile(files);
});
