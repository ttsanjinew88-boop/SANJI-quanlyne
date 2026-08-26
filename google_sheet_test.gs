/**************************************************************************
 * NE / SANJI — KIỂM TRA NGHIỆP VỤ (Apps Script backend cho tab T5)
 * ------------------------------------------------------------------------
 * Đây là bản viết lại của app test cũ để ghép vào dashboard NE:
 *   • KHÔNG còn giao diện HTML (doGet đã bỏ) — giao diện nằm trong dashboard.
 *   • KHÔNG còn mật khẩu riêng từng nhân viên, KHÔNG còn ADMIN_PW.
 *     Danh tính + vai trò do Supabase Edge Function xác thực rồi gửi kèm.
 *   • Chỉ nhận request đi qua Edge Function `super-function` (kiểm TOKEN).
 *   • Khóa dòng theo `user_id` (UUID Supabase) — đổi tên tài khoản KHÔNG mất
 *     lịch sử test (bài học từ vụ CHAMY -> SOLIS ở bảng điểm bất thường).
 *
 * ===================== CÀI ĐẶT (làm 1 lần) =====================
 * 1. Mở Google Sheet dùng để lưu bài test -> Tiện ích mở rộng -> Apps Script.
 * 2. Dán TOÀN BỘ file này, đổi TOKEN bên dưới thành 1 chuỗi ngẫu nhiên dài.
 * 3. Chạy hàm `setup()` 1 lần (tạo đủ các sheet + dữ liệu mẫu).
 * 4. Triển khai -> Tùy chọn triển khai mới -> Ứng dụng web
 *      Thực thi với: Tôi        |  Ai có quyền truy cập: Bất kỳ ai
 *    -> Copy URL /exec.
 * 5. Supabase -> Edge Functions -> Secrets, thêm 2 secret:
 *      GS_EXAM_URL   = URL /exec vừa copy
 *      GS_EXAM_TOKEN = đúng chuỗi TOKEN ở bước 2
 *    rồi deploy lại `super-function`.
 *
 * ⚠ SỬA FILE NÀY XONG phải: Triển khai -> Quản lý triển khai -> ✎ -> Phiên
 *   bản mới (URL không đổi). Không làm bước này thì sửa xong vẫn chạy bản cũ.
 *
 * ===================== BẢO TRÌ =====================
 * • Sheet `Results` phình ~400 dòng/tháng (20 người × 20 câu). Mỗi lần đọc là
 *   quét cả sheet, nên MỖI NĂM chạy tay `archiveResults()` một lần: cắt dữ
 *   liệu sang sheet `Results <năm>` để sheet chính luôn nhẹ.
 * • `RankCache` giữ bảng xếp hạng đã tính sẵn (tự làm mới khi có bài được
 *   chấm) — tránh quét lại toàn bộ Results mỗi lần ai đó mở tab Xếp Hạng.
 **************************************************************************/

var TOKEN = 'DOI-CHUOI-NAY-THANH-MOT-CHUOI-NGAU-NHIEN-DAI';  // <-- ĐỔI, phải trùng secret GS_EXAM_TOKEN

var SS = SpreadsheetApp.getActiveSpreadsheet();
var SH_TOPICS  = 'Topics';
var SH_BANK    = 'Bank';
var SH_CONFIG  = 'Config';
var SH_RESULTS = 'Results';
var SH_SET     = 'Settings';
var SH_MEMBERS = 'Members';
var SH_PENDING = 'Pending';
var SH_RANK    = 'RankCache';

var H_TOPICS  = ['id', 'name', 'color'];
var H_BANK    = ['id', 'topic', 'level', 'question', 'imageUrl', 'answer'];
var H_CONFIG  = ['topicId', 'count'];
var H_RESULTS = ['submissionId', 'time', 'user_id', 'username', 'topic', 'question',
                 'employeeAnswer', 'sampleAnswer', 'score', 'note', 'durationSec', 'imageUrl'];
var H_SET     = ['key', 'value'];
var H_MEMBERS = ['user_id', 'username', 'remaining', 'used', 'examCfg'];
var H_PENDING = ['user_id', 'submissionId', 'startedAt', 'questions'];
var H_RANK    = ['key', 'value'];

/* ==================== KHỞI TẠO ==================== */
function setup() {
  ensureSheet_(SH_TOPICS, H_TOPICS);
  ensureSheet_(SH_BANK, H_BANK);
  ensureSheet_(SH_CONFIG, H_CONFIG);
  ensureSheet_(SH_RESULTS, H_RESULTS);
  ensureSheet_(SH_SET, H_SET);
  ensureSheet_(SH_MEMBERS, H_MEMBERS);
  ensureSheet_(SH_PENDING, H_PENDING);
  ensureSheet_(SH_RANK, H_RANK);

  var st = readSettings_();
  if (st.duration === undefined) setSetting_('duration', 45);
  if (st.showAnswerOnLookup === undefined) setSetting_('showAnswerOnLookup', 'no');

  var t = SS.getSheetByName(SH_TOPICS);
  if (t.getLastRow() < 2) {
    t.getRange(2, 1, 6, 3).setValues([
      ['tuluan', 'Tự luận nghiệp vụ', '#7c3aed'],
      ['roulette', 'Sảnh — Roulette', '#f59e0b'],
      ['baccarat', 'Sảnh — Baccarat', '#10b981'],
      ['slot', 'Sảnh — Slot', '#3b82f6'],
      ['sport', 'Sảnh — Thể thao', '#06b6d4'],
      ['tinhhuong', 'Xử lý tình huống', '#ec4899']
    ]);
    SS.getSheetByName(SH_CONFIG).getRange(2, 1, 6, 2).setValues([
      ['tuluan', 5], ['roulette', 3], ['baccarat', 2], ['slot', 2], ['sport', 3], ['tinhhuong', 5]
    ]);
  }
  try { SpreadsheetApp.getUi().alert('Đã tạo/cập nhật xong các sheet.'); } catch (e) {}
}

function ensureSheet_(name, headers) {
  var sh = SS.getSheetByName(name);
  if (!sh) sh = SS.insertSheet(name);
  var lastCol = sh.getLastColumn();
  var cur = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var khac = false;
  for (var i = 0; i < headers.length; i++) {
    if (String(cur[i] || '').trim() !== headers[i]) { khac = true; break; }
  }
  if (khac) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
}
function sheet_(name) {
  var map = {}; map[SH_TOPICS] = H_TOPICS; map[SH_BANK] = H_BANK; map[SH_CONFIG] = H_CONFIG;
  map[SH_RESULTS] = H_RESULTS; map[SH_SET] = H_SET; map[SH_MEMBERS] = H_MEMBERS;
  map[SH_PENDING] = H_PENDING; map[SH_RANK] = H_RANK;
  return SS.getSheetByName(name) || ensureSheet_(name, map[name] || []);
}
function uid_(p) { return (p || 'q') + Utilities.getUuid().slice(0, 8); }
function subId_() {
  var now = new Date();
  var s = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyMMddHHmmss');
  return 'EX' + s + ('0' + Math.floor(now.getMilliseconds() / 10)).slice(-2);
}
function fmt_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  return String(v == null ? '' : v);
}

/* ==================== ĐIỂM VÀO DUY NHẤT ==================== */
// Chỉ nhận POST từ Edge Function. Không có doGet -> mở URL bằng trình duyệt là trắng.
function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (String(body.token || '') !== TOKEN) throw new Error('Sai token');
    var caller = body.caller || {};
    if (!caller.id) throw new Error('Thiếu danh tính người gọi');
    out = { ok: true, data: route_(String(body.action || ''), body.payload || {}, caller, body.profiles || null) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function isTT_(caller) { return caller.role === 'admin' || caller.role === 'totruong'; }
function needTT_(caller) { if (!isTT_(caller)) throw new Error('Chức năng này chỉ dành cho Tổ Trưởng trở lên.'); }

function route_(action, p, caller, profiles) {
  switch (action) {
    /* --- ai cũng gọi được --- */
    case 'boot':      return apiBoot_(caller);
    case 'start':     return apiStart_(caller);
    case 'submit':    return apiSubmit_(caller, p);
    case 'mine':      return apiMine_(caller);
    case 'rank':      return apiRank_(p);
    /* --- Tổ Trưởng trở lên --- */
    case 'members':      needTT_(caller); return apiMembers_(profiles);
    case 'saveMember':   needTT_(caller); return apiSaveMember_(p);
    case 'resetUsed':    needTT_(caller); return apiResetUsed_(p);
    case 'saveMemberCfg':needTT_(caller); return apiSaveMemberCfg_(p);
    case 'list':         needTT_(caller); return apiList_();
    case 'sub':          needTT_(caller); return apiSub_(p);
    case 'grade':        needTT_(caller); return apiGrade_(caller, p);
    case 'addQ':         needTT_(caller); return apiAddQ_(p);
    case 'updQ':         needTT_(caller); return apiUpdQ_(p);
    case 'delQ':         needTT_(caller); return apiDelQ_(p);
    case 'addT':         needTT_(caller); return apiAddT_(p);
    case 'updT':         needTT_(caller); return apiUpdT_(p);
    case 'delT':         needTT_(caller); return apiDelT_(p);
    case 'setCfg':       needTT_(caller); return apiSetCfg_(p);
    case 'setSettings':  needTT_(caller); return apiSetSettings_(p);
  }
  throw new Error('Hành động không hợp lệ: ' + action);
}

/* ==================== ĐỌC BẢNG ==================== */
function readObjects_(name) {
  var sh = SS.getSheetByName(name);
  if (!sh) return [];
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  var head = v[0], out = [];
  for (var i = 1; i < v.length; i++) {
    if (v[i].join('') === '') continue;
    var o = {};
    for (var j = 0; j < head.length; j++) o[head[j]] = v[i][j];
    out.push(o);
  }
  return out;
}
function readConfig_() {
  var c = {};
  readObjects_(SH_CONFIG).forEach(function (r) { if (r.topicId) c[r.topicId] = Number(r.count) || 0; });
  return c;
}
function readSettings_() {
  var s = {};
  readObjects_(SH_SET).forEach(function (r) { if (r.key) s[r.key] = r.value; });
  return s;
}
function setSetting_(key, value) {
  var sh = sheet_(SH_SET), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (v[i][0] === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  sh.appendRow([key, value]);
}
function delRowByCol_(name, col, val) {
  var sh = sheet_(name), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) if (v[i][col] === val) sh.deleteRow(i + 1);
}
/* Link Google Drive -> link ảnh hiển thị được */
function normalizeImg_(url) {
  if (!url) return '';
  url = String(url).trim();
  if (!url) return '';
  if (url.indexOf('drive.google.com') > -1 || url.indexOf('docs.google.com') > -1) {
    var m = url.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/) ||
            url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/) ||
            url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1200';
  }
  return url;
}

/* ==================== THÀNH VIÊN (lượt test + đề riêng) ==================== */
function memberRow_(userId) {
  var sh = sheet_(SH_MEMBERS), last = sh.getLastRow();
  if (last < 2) return -1;
  var v = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]) === String(userId)) return i + 2;
  return -1;
}
// Không có dòng thì tạo mới với 0 lượt (TT phải cấp lượt thì mới test được).
function memberEnsure_(userId, username) {
  var row = memberRow_(userId);
  var sh = sheet_(SH_MEMBERS);
  if (row < 0) { sh.appendRow([userId, username || '', 0, 0, '']); row = sh.getLastRow(); }
  else if (username) sh.getRange(row, 2).setValue(username);
  return row;
}
function memberGet_(userId, username) {
  var row = memberEnsure_(userId, username);
  var v = sheet_(SH_MEMBERS).getRange(row, 1, 1, 5).getValues()[0];
  var cfg = null, raw = String(v[4] || '').trim();
  if (raw && raw.toLowerCase() !== 'default') { try { var o = JSON.parse(raw); if (o && typeof o === 'object') cfg = o; } catch (e) {} }
  return { row: row, user_id: String(v[0]), username: String(v[1] || ''), remaining: Number(v[2]) || 0, used: Number(v[3]) || 0, examCfg: cfg };
}

/* ==================== API: BOOT ==================== */
function apiBoot_(caller) {
  var tt = isTT_(caller);
  var bank = readObjects_(SH_BANK).map(function (b) {
    var o = { id: b.id, topic: b.topic, level: b.level, question: b.question, imageUrl: normalizeImg_(b.imageUrl) };
    if (tt) o.answer = b.answer;   // ĐÁP ÁN MẪU: chỉ Tổ Trưởng trở lên mới nhận
    return o;
  });
  var st = readSettings_();
  var me = memberGet_(caller.id, caller.username);
  var pend = pendingGet_(caller.id);
  return {
    topics: readObjects_(SH_TOPICS),
    bank: bank,
    config: readConfig_(),
    settings: { duration: Number(st.duration) || 45, showAnswerOnLookup: String(st.showAnswerOnLookup || 'no') === 'yes' },
    me: { remaining: me.remaining, used: me.used, examCfg: me.examCfg, canEdit: tt },
    pending: pend ? { sid: pend.sid, startedAt: pend.startedAt, count: pend.questions.length } : null
  };
}

/* ==================== API: BẮT ĐẦU / NỘP BÀI ==================== */
function shuffle_(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; }
  return a;
}
function generateExam_(cfgOverride) {
  var topics = readObjects_(SH_TOPICS), bank = readObjects_(SH_BANK);
  var config = cfgOverride || readConfig_(), qs = [];
  topics.forEach(function (t) {
    var need = config[t.id] || 0;
    if (need <= 0) return;
    shuffle_(bank.filter(function (b) { return b.topic === t.id; })).slice(0, need).forEach(function (b) {
      qs.push({ topic: b.topic, question: b.question, imageUrl: normalizeImg_(b.imageUrl), answer: b.answer });
    });
  });
  return shuffle_(qs);
}
function pendingGet_(userId) {
  var sh = sheet_(SH_PENDING), last = sh.getLastRow();
  if (last < 2) return null;
  var v = sh.getRange(2, 1, last - 1, 4).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]) === String(userId)) {
      // `at` = mốc thời gian THẬT (ms) đọc từ ô sheet — dùng để tính elapsed phía
      // server. `startedAt` chỉ để hiển thị. Ô có thể là Date (Sheet tự nhận dạng)
      // hoặc chuỗi, nên xử lý cả hai.
      try {
        var raw = v[i][2];
        var at = (raw instanceof Date) ? raw.getTime() : new Date(String(raw).replace(' ', 'T')).getTime();
        return { row: i + 2, sid: String(v[i][1]), startedAt: fmt_(raw), at: at, questions: JSON.parse(v[i][3] || '[]') };
      } catch (e) { return null; }
    }
  }
  return null;
}
function pendingClear_(userId) {
  var p = pendingGet_(userId);
  if (p) sheet_(SH_PENDING).deleteRow(p.row);
}
// Bỏ đáp án trước khi gửi về máy nhân viên — client KHÔNG BAO GIỜ thấy đáp án mẫu lúc làm bài.
function stripAnswers_(qs) {
  return qs.map(function (q) { return { topic: q.topic, question: q.question, imageUrl: q.imageUrl || '' }; });
}
/* Lượt bị trừ NGAY khi bắt đầu (chống bấm bắt đầu nhiều lần để đổi đề), nhưng đề được
   lưu vào sheet Pending: mất mạng / F5 / đóng tab rồi vào lại thì NHẬN LẠI ĐÚNG ĐỀ CŨ
   và KHÔNG bị trừ thêm lượt. Đồng hồ đếm từ startedAt của server. */
function apiStart_(caller) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var me = memberGet_(caller.id, caller.username);
    var st = readSettings_();
    var dur = Number(st.duration) || 45;

    var pend = pendingGet_(caller.id);
    if (pend) {
      // `elapsed` do SERVER tính rồi gửi về (giây). KHÔNG gửi mốc thời gian dạng
      // chuỗi để trình duyệt tự parse: chuỗi không mang múi giờ, máy nhân viên sẽ
      // hiểu theo giờ máy mình -> lệch múi giờ là đồng hồ sai/hết giờ ngay.
      var elapsed = Math.round((new Date().getTime() - pend.at) / 1000);
      if (elapsed < (dur + 30) * 60) {
        return { resumed: true, sid: pend.sid, startedAt: pend.startedAt, elapsed: elapsed, duration: dur,
                 questions: stripAnswers_(pend.questions), remaining: me.remaining };
      }
      pendingClear_(caller.id);   // bỏ quá lâu -> hủy, lượt đã trừ coi như đã dùng
    }

    if (me.remaining <= 0) throw new Error('Bạn đã hết lượt làm bài. Liên hệ Tổ Trưởng để được cấp thêm.');
    var qs = generateExam_(me.examCfg);
    if (!qs.length) throw new Error('Chưa có câu hỏi được cấu hình. Nhờ Tổ Trưởng thiết lập đề.');

    var sid = subId_();
    var startedAt = fmt_(new Date());
    sheet_(SH_PENDING).appendRow([caller.id, sid, startedAt, JSON.stringify(qs)]);
    var sh = sheet_(SH_MEMBERS);
    sh.getRange(me.row, 3).setValue(me.remaining - 1);
    sh.getRange(me.row, 4).setValue(me.used + 1);
    return { resumed: false, sid: sid, startedAt: startedAt, elapsed: 0, duration: dur,
             questions: stripAnswers_(qs), remaining: me.remaining - 1 };
  } finally { lock.releaseLock(); }
}
function apiSubmit_(caller, p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var pend = pendingGet_(caller.id);
    if (!pend) throw new Error('Không tìm thấy bài đang làm (có thể đã nộp rồi).');
    if (p.sid && String(p.sid) !== pend.sid) throw new Error('Mã bài không khớp.');

    var replies = p.answers || [];
    var now = fmt_(new Date());
    var dur = Number(p.durationSec) || 0;
    var topics = readObjects_(SH_TOPICS), tname = {};
    topics.forEach(function (t) { tname[t.id] = t.name; });

    var rows = pend.questions.map(function (q, i) {
      return [pend.sid, now, caller.id, caller.username || '', tname[q.topic] || q.topic,
              q.question, String(replies[i] || ''), q.answer || '', '', '', dur, q.imageUrl || ''];
    });
    var sh = sheet_(SH_RESULTS);
    if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, H_RESULTS.length).setValues(rows);
    pendingClear_(caller.id);
    return { sid: pend.sid, count: rows.length };
  } finally { lock.releaseLock(); }
}

/* ==================== ĐỌC KẾT QUẢ ==================== */
function readResults_() {
  var sh = SS.getSheetByName(SH_RESULTS);
  if (!sh) return [];
  var v = sh.getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (String(r.join('')).trim() === '') continue;
    out.push({ sid: String(r[0]), time: fmt_(r[1]), user_id: String(r[2]), username: String(r[3] || ''),
               topic: r[4], question: r[5], reply: r[6], answer: r[7],
               score: (r[8] == null ? '' : r[8]), note: (r[9] == null ? '' : r[9]),
               durationSec: Number(r[10]) || 0, imageUrl: r[11] || '' });
  }
  return out;
}
function groupSubs_(rows) {
  var g = {}, order = [];
  rows.forEach(function (r) {
    if (!g[r.sid]) { g[r.sid] = { id: r.sid, time: r.time, user_id: r.user_id, username: r.username,
                                  durationSec: 0, count: 0, scored: 0, total: 0, items: [] }; order.push(r.sid); }
    var o = g[r.sid];
    if (r.durationSec) o.durationSec = r.durationSec;
    o.count++;
    if (String(r.score).trim() !== '') { o.scored++; o.total += Number(r.score) || 0; }
    o.items.push(r);
  });
  return order.map(function (k) { var o = g[k]; o.graded = o.scored > 0; return o; });
}
function apiMine_(caller) {
  var st = readSettings_();
  var showAns = isTT_(caller) || String(st.showAnswerOnLookup || 'no') === 'yes';
  var rows = readResults_().filter(function (r) { return String(r.user_id) === String(caller.id); });
  var list = groupSubs_(rows).map(function (s) {
    return { id: s.id, time: s.time, durationSec: s.durationSec, count: s.count, total: s.total, graded: s.graded,
             items: s.items.map(function (it) {
               return { topic: it.topic, question: it.question, imageUrl: it.imageUrl, reply: it.reply,
                        answer: showAns ? it.answer : '', score: it.score, note: it.note };
             }) };
  });
  list.sort(function (a, b) { return String(b.time).localeCompare(String(a.time)); });
  return { showAnswer: showAns, submissions: list };
}
/* Danh sách TÓM TẮT cho TT (không kèm nội dung câu hỏi/đáp án).
   Nội dung nặng vài trăm KB -> gửi hết 1 lần làm trình duyệt nhận rỗng / treo. */
function apiList_() {
  var list = groupSubs_(readResults_()).map(function (s) {
    return { id: s.id, time: s.time, username: s.username, durationSec: s.durationSec,
             count: s.count, total: s.total, graded: s.graded };
  });
  list.sort(function (a, b) {
    if (a.graded !== b.graded) return a.graded ? 1 : -1;      // Chờ chấm lên đầu
    return String(b.time).localeCompare(String(a.time));
  });
  return list;
}
function apiSub_(p) {
  var sid = String(p.sid || ''), out = [];
  readResults_().forEach(function (r) {
    if (r.sid !== sid) return;
    out.push({ topic: String(r.topic || ''), question: String(r.question || ''), imageUrl: String(r.imageUrl || ''),
               reply: String(r.reply || ''), answer: String(r.answer || ''),
               score: (r.score == null ? '' : String(r.score)), note: String(r.note || '') });
  });
  return out;
}
function apiGrade_(caller, p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sid = String(p.sid || ''), grades = p.grades || [];
    var sh = sheet_(SH_RESULTS), v = sh.getDataRange().getValues(), idx = 0;
    for (var i = 1; i < v.length; i++) {
      if (String(v[i].join('')).trim() === '') continue;
      if (String(v[i][0]) !== sid) continue;
      var g = grades[idx] || {};
      var sc = (g.score === '' || g.score == null) ? 0 : (Number(g.score) || 0);
      sh.getRange(i + 1, 9).setValue(sc);
      sh.getRange(i + 1, 10).setValue(String(g.note || ''));
      idx++;
    }
    rankInvalidate_();
    return { graded: idx };
  } finally { lock.releaseLock(); }
}

/* ==================== XẾP HẠNG (có cache) ==================== */
function rankInvalidate_() {
  var sh = sheet_(SH_RANK), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) sh.deleteRow(i + 1);
}
function rankCacheGet_(key) {
  var v = sheet_(SH_RANK).getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === key) { try { return JSON.parse(v[i][1]); } catch (e) { return null; } }
  return null;
}
function rankCacheSet_(key, val) {
  var s = JSON.stringify(val);
  if (s.length > 45000) return;             // ô Google Sheet tối đa 50.000 ký tự
  sheet_(SH_RANK).appendRow([key, s]);
}
/* month = 'YYYY-MM' hoặc 'all'. Xếp theo điểm TRUNG BÌNH mỗi câu (giảm dần).
   Mỗi người chỉ lấy BÀI TỐT NHẤT trong kỳ (làm nhiều lượt không bị thiệt/lợi thế). */
function apiRank_(p) {
  var month = String(p.month || 'all');
  var cached = rankCacheGet_(month);
  if (cached) return cached;

  var rows = readResults_();
  if (month !== 'all') rows = rows.filter(function (r) { return String(r.time).slice(0, 7) === month; });
  var best = {};
  groupSubs_(rows).forEach(function (s) {
    if (!s.graded || !s.count) return;
    var avg = s.total / s.count;
    var k = s.user_id || s.username;
    if (!best[k] || avg > best[k].avg) {
      best[k] = { user_id: s.user_id, name: s.username, total: s.total, count: s.count, avg: avg, time: s.time, id: s.id };
    }
  });
  var list = Object.keys(best).map(function (k) { return best[k]; });
  list.sort(function (a, b) { return (b.avg !== a.avg) ? (b.avg - a.avg) : (b.total - a.total); });
  var out = { month: month, list: list.slice(0, 100) };
  rankCacheSet_(month, out);
  return out;
}

/* ==================== QUẢN LÝ THÀNH VIÊN ==================== */
/* profiles = danh sách tài khoản do Edge Function đọc từ Supabase và gửi kèm
   ([{user_id,username,role}]) -> hợp nhất với sheet Members để TT thấy CẢ người
   chưa từng test. Sheet không cần gõ tay tên nhân viên nữa. */
function apiMembers_(profiles) {
  var sh = sheet_(SH_MEMBERS), last = sh.getLastRow();
  var have = {};
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 5).getValues().forEach(function (r) {
      if (!String(r[0])) return;
      var cfg = null, raw = String(r[4] || '').trim();
      if (raw && raw.toLowerCase() !== 'default') { try { var o = JSON.parse(raw); if (o && typeof o === 'object') cfg = o; } catch (e) {} }
      have[String(r[0])] = { user_id: String(r[0]), username: String(r[1] || ''), remaining: Number(r[2]) || 0, used: Number(r[3]) || 0, examCfg: cfg };
    });
  }
  var out = [];
  (profiles || []).forEach(function (pr) {
    var id = String(pr.user_id || '');
    if (!id) return;
    var m = have[id] || { user_id: id, username: pr.username || '', remaining: 0, used: 0, examCfg: null };
    m.username = pr.username || m.username;
    m.role = pr.role || 'nhanvien';
    out.push(m); delete have[id];
  });
  // tài khoản đã xóa nhưng vẫn còn dòng trong sheet -> vẫn hiện để TT biết
  Object.keys(have).forEach(function (k) { var m = have[k]; m.role = '(đã xóa)'; out.push(m); });
  return out;
}
function apiSaveMember_(p) {
  var row = memberEnsure_(String(p.user_id || ''), String(p.username || ''));
  sheet_(SH_MEMBERS).getRange(row, 3).setValue(Number(p.remaining) || 0);
  return true;
}
function apiResetUsed_(p) {
  var row = memberEnsure_(String(p.user_id || ''), String(p.username || ''));
  sheet_(SH_MEMBERS).getRange(row, 4).setValue(0);
  return true;
}
function apiSaveMemberCfg_(p) {
  var row = memberEnsure_(String(p.user_id || ''), String(p.username || ''));
  if (p.useDefault) { sheet_(SH_MEMBERS).getRange(row, 5).setValue(''); return true; }
  var clean = {}, cfg = p.cfg || {};
  Object.keys(cfg).forEach(function (k) { var n = Number(cfg[k]) || 0; if (n > 0) clean[k] = n; });
  sheet_(SH_MEMBERS).getRange(row, 5).setValue(JSON.stringify(clean));
  return true;
}

/* ==================== QUẢN LÝ ĐỀ ==================== */
function apiAddQ_(p) {
  var id = uid_('q'), img = normalizeImg_(p.imageUrl);
  sheet_(SH_BANK).appendRow([id, p.topic, p.level || 'Trung bình', p.question || '', img, p.answer || '']);
  return { id: id, topic: p.topic, level: p.level || 'Trung bình', question: p.question || '', imageUrl: img, answer: p.answer || '' };
}
function apiUpdQ_(p) {
  var sh = sheet_(SH_BANK), v = sh.getDataRange().getValues(), img = normalizeImg_(p.imageUrl);
  for (var i = 1; i < v.length; i++) {
    if (v[i][0] === p.id) {
      sh.getRange(i + 1, 1, 1, 6).setValues([[p.id, p.topic, p.level || 'Trung bình', p.question || '', img, p.answer || '']]);
      return { id: p.id, topic: p.topic, level: p.level || 'Trung bình', question: p.question || '', imageUrl: img, answer: p.answer || '' };
    }
  }
  throw new Error('Không tìm thấy câu hỏi');
}
function apiDelQ_(p) { delRowByCol_(SH_BANK, 0, p.id); return true; }
function apiAddT_(p) {
  var id = uid_('t');
  sheet_(SH_TOPICS).appendRow([id, p.name, p.color]);
  sheet_(SH_CONFIG).appendRow([id, 0]);
  return { id: id, name: p.name, color: p.color };
}
function apiUpdT_(p) {
  var sh = sheet_(SH_TOPICS), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (v[i][0] === p.id) { sh.getRange(i + 1, 1, 1, 3).setValues([[p.id, p.name, p.color]]); return { id: p.id, name: p.name, color: p.color }; }
  throw new Error('Không tìm thấy chủ đề');
}
function apiDelT_(p) {
  delRowByCol_(SH_TOPICS, 0, p.id);
  delRowByCol_(SH_CONFIG, 0, p.id);
  delRowByCol_(SH_BANK, 1, p.id);
  return true;
}
function apiSetCfg_(p) {
  var sh = sheet_(SH_CONFIG), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (v[i][0] === p.topicId) { sh.getRange(i + 1, 2).setValue(Number(p.count) || 0); return true; }
  sh.appendRow([p.topicId, Number(p.count) || 0]);
  return true;
}
function apiSetSettings_(p) {
  if (p.duration !== undefined) setSetting_('duration', Number(p.duration) || 45);
  if (p.showAnswerOnLookup !== undefined) setSetting_('showAnswerOnLookup', p.showAnswerOnLookup ? 'yes' : 'no');
  return true;
}

/* ==================== BẢO TRÌ: cắt Results theo năm ==================== */
// Chạy TAY mỗi năm 1 lần (Apps Script -> chọn hàm -> Chạy). Giữ sheet chính nhẹ
// để mọi thao tác đọc không chậm dần theo thời gian.
function archiveResults() {
  var sh = sheet_(SH_RESULTS), last = sh.getLastRow();
  if (last < 2) return;
  var year = String(new Date().getFullYear() - 1);
  var v = sh.getDataRange().getValues(), keep = [v[0]], move = [];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i].join('')).trim() === '') continue;
    (String(fmt_(v[i][1])).slice(0, 4) <= year ? move : keep).push(v[i]);
  }
  if (!move.length) return;
  var dst = SS.getSheetByName('Results ' + year) || SS.insertSheet('Results ' + year);
  dst.clear();
  dst.getRange(1, 1, 1, H_RESULTS.length).setValues([H_RESULTS]);
  dst.getRange(2, 1, move.length, H_RESULTS.length).setValues(move);
  sh.clear();
  sh.getRange(1, 1, keep.length, H_RESULTS.length).setValues(keep);
  rankInvalidate_();
  Logger.log('Đã chuyển ' + move.length + ' dòng sang "Results ' + year + '"');
}
