/**
 * BÁO CÁO ĐẠI LÝ BẤT THƯỜNG → GOOGLE SHEET (SANJI / NEW88) — BẢN 2
 * Sheet đích: https://docs.google.com/spreadsheets/d/1SnmzU9p0lhNWf7es7_SXVInWcPPl78cc7IzQdnAsD7E/edit?gid=1340440362
 *
 * ============ CẬP NHẬT TỪ BẢN CŨ ============
 * Đã dán bản cũ rồi? Chỉ cần: xóa hết code cũ → dán TOÀN BỘ file này → Lưu (Ctrl+S)
 * → Triển khai (Deploy) → "Quản lý các tùy chọn triển khai" (Manage deployments)
 * → bấm ✎ (Edit) → Phiên bản (Version): "Phiên bản mới" (New version) → Deploy.
 * URL KHÔNG đổi — dashboard không cần sửa gì.
 *
 * ============ CÀI ĐẶT LẦN ĐẦU ============
 * 1. Mở Google Sheet trên → Tiện ích mở rộng → Apps Script → dán file này → Lưu.
 * 2. Cài đặt dự án (Project Settings) → Múi giờ = (GMT+07:00) Ho Chi Minh.
 * 3. Deploy → New deployment → Web app: Execute as = Me · Who has access = Anyone → copy URL.
 * 4. Chọn hàm "setupTrigger" → Run 1 lần (bật backup 06:00 sáng ngày 1 hằng tháng).
 *
 * ============ ĐỊNH DẠNG GHI VÀO SHEET ============
 * - Dữ liệu điền THEO TIÊU ĐỀ HÀNG 1 của sheet (đổi thứ tự cột trên sheet vẫn điền đúng).
 * - KHÔNG có cột Cổng nạp / Khu vực.
 * - Mỗi đại lý 1 khối riêng, cách nhau 1 dòng trống; cột "Đại lý" gộp ô (merge) cả khối, nền cam nhạt.
 * - Chữ: Tahoma 9, in đậm, căn giữa. Ô thường nền VÀNG NHẠT (#FFF2CC), ô không có dữ liệu điền "-".
 * - Viền: trong mảnh, viền NGOÀI mỗi khối đậm (medium) — giống báo cáo thủ công.
 * - Ô được tô nghi ngờ trên dashboard: VÀNG ĐẬM (#FFE599); riêng cột Âm/Dương: ĐỎ NHẠT (#FFC7CE).
 * - Ô tên Đại lý: CAM (#F4B084).
 * - Cấp bậc chứa "ĐỔI ĐẦU" (DD-): TỰ ĐỘNG tô đỏ nhạt (#FFC7CE) không cần tô tay.
 */

var SHEET_GID = 1340440362;      // gid của sheet nhận báo cáo (trên URL)
var TOKEN     = 'sanji-bc-2026'; // phải trùng BC.GS_TOKEN trong dashboard_v2.html

var C_HEAD    = '#F8CBAD'; // cam nhạt: hàng tiêu đề
var C_AGENT   = '#F4B084'; // cam đậm: ô tên Đại lý (merge cả khối)
var C_MARK    = '#FFE599'; // vàng đậm: ô tô nghi ngờ (điểm nhấn bất thường, mọi cột)
var C_MARK_AD = '#FFC7CE'; // đỏ nhạt: ô tô cột Âm/Dương + Cấp bậc ĐỐI ĐẦU (tự động)
var C_DATA    = '#FFF2CC'; // vàng nhạt: ô dữ liệu thường (giống báo cáo thủ công)

// Tiêu đề mặc định (chỉ tự ghi khi hàng 1 đang trống) — 21 cột, KHÔNG có Cổng/Khu vực
var HEADERS = ['STT','Đại lý','Tên tài khoản','Cấp bậc','Họ tên đăng kí','Khách','Chỉ tiêu',
  'Tổng nạp','Lần nạp','Tổng rút','Lần rút','Âm/Dương','Cược hợp lệ','Ngân hàng','Chi nhánh',
  'STK','IP','Thiết bị','IP đăng ký','IP đăng nhập','Sảnh'];

// Tiêu đề hàng 1 (đã chuẩn hóa chữ thường) → tên field dashboard gửi lên
var HEADER_FIELD = {
  'stt':'__stt', 'đại lý':'__agent',
  'tên tài khoản':'id', 'id':'id',
  'cấp bậc':'cap_bac',
  'họ tên đăng kí':'ho_ten', 'họ tên đăng ký':'ho_ten', 'họ tên':'ho_ten',
  'khách':'khach', 'chỉ tiêu':'chi_tieu',
  'tổng nạp':'tien_nap', 'tiền nạp':'tien_nap',
  'lần nạp':'lan_nap',
  'tổng rút':'tien_rut', 'tiền rút':'tien_rut',
  'lần rút':'lan_rut',
  'âm/dương':'am_duong', 'âm dương':'am_duong',
  'cược hợp lệ':'cuoc_hop_le',
  'ngân hàng':'ngan_hang', 'chi nhánh':'chi_nhanh', 'stk':'stk', 'ip':'ip',
  'thiết bị':'thiet_bi',
  'ip đăng ký':'link_dk', 'link đăng ký':'link_dk', 'link đăng kí':'link_dk',
  'ip đăng nhập':'link_dn', 'link đăng nhập':'link_dn',
  'sảnh':'game', 'cược sảnh':'game', 'game':'game'
};

function norm_(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

// Cấp bậc "đối đầu": chứa chữ ĐỔI ĐẦU (mọi kiểu hoa/thường) hoặc mã [DD-...]
function isDoiDau_(v) {
  var s = norm_(v);
  return s.indexOf('đổi đầu') > -1 || s.indexOf('đối đầu') > -1 || s.indexOf('doi dau') > -1 || /\[?dd-/.test(s);
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shs = ss.getSheets();
  for (var i = 0; i < shs.length; i++) if (shs[i].getSheetId() === SHEET_GID) return shs[i];
  return shs[0];
}

// Hàng 1 trống thì tự ghi tiêu đề mặc định (cam nhạt, Tahoma 9 đậm)
function ensureHeader_(sh) {
  var first = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), HEADERS.length)).getValues()[0];
  if (first.some(function (v) { return String(v || '') !== ''; })) return;
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setBackground(C_HEAD).setFontFamily('Tahoma').setFontSize(9).setFontWeight('bold')
    .setFontColor('#000000').setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true);
}

// Nhận báo cáo từ dashboard: {token, by, blocks:[{agent, rows:[{v:{field:value}, mk:[field]}]}]}
function doPost(e) {
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (b.token !== TOKEN) return out_({ ok: false, error: 'Sai token' });
    var blocks = b.blocks || [];
    if (!blocks.length) return out_({ ok: false, error: 'Không có dữ liệu' });
    var sh = getSheet_();
    ensureHeader_(sh);
    var nc = sh.getLastColumn();
    var hdr = sh.getRange(1, 1, 1, nc).getValues()[0];
    var fields = hdr.map(function (h) { return HEADER_FIELD[norm_(h)] || null; });
    var aCol = fields.indexOf('__agent');
    var total = 0;
    blocks.forEach(function (bl) {
      var rows = bl.rows || [];
      if (!rows.length) return;
      // luôn chừa 1 dòng trống: ngăn cách các khối và cách cả hàng tiêu đề (giống bản thủ công)
      var start = sh.getLastRow() + 2;
      var vals = rows.map(function (rw, ri) {
        return fields.map(function (f) {
          if (f === '__stt') return '';
          if (f === '__agent') return ri === 0 ? (bl.agent || '') : '';
          if (!f) return '';
          var v = (rw.v && rw.v[f] != null) ? rw.v[f] : '';
          if (String(v).trim() !== '') return v;
          return f === 'ngan_hang' ? 'USDT' : '-'; // Ngân hàng trống = USDT; ô trống khác điền "-"
        });
      });
      var cols = rows.map(function (rw) {
        var mk = {};
        (rw.mk || []).forEach(function (f) { mk[f] = 1; });
        return fields.map(function (f) {
          if (f === '__agent') return C_AGENT;
          // Cấp bậc ĐỐI ĐẦU (DD-): tự động đỏ nhạt, không cần tô tay
          if (f === 'cap_bac' && isDoiDau_(rw.v && rw.v.cap_bac)) return C_MARK_AD;
          if (f && mk[f]) return f === 'am_duong' ? C_MARK_AD : C_MARK;
          return C_DATA;
        });
      });
      var rg = sh.getRange(start, 1, rows.length, nc);
      rg.setNumberFormat('@')          // giữ STK/IP dạng chữ, tiền đã định dạng sẵn kiểu VN
        .setValues(vals)
        .setFontFamily('Tahoma').setFontSize(9).setFontWeight('bold').setFontColor('#000000')
        .setHorizontalAlignment('center').setVerticalAlignment('middle')
        .setBorder(true, true, true, true, true, true)
        .setBackgrounds(cols);
      // viền NGOÀI khối đậm như bản thủ công (viền trong giữ mảnh)
      rg.setBorder(true, true, true, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
      if (aCol > -1 && rows.length > 1) {
        try { sh.getRange(start, aCol + 1, rows.length, 1).merge(); } catch (err) {}
      }
      total += rows.length;
    });
    return out_({ ok: true, added: total, agents: blocks.length, by: b.by || '' });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Sáng ngày 1 hằng tháng (trigger): backup sheet → "Báo cáo đại lý ngoài tháng M - YYYY"
// (M = tháng vừa kết thúc), rồi xóa dữ liệu sheet gốc, chừa lại dòng 1 tiêu đề.
function monthlyRotate() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getSheet_();
  var d = new Date(); d.setDate(0); // lùi về ngày cuối của tháng trước
  var name = 'Báo cáo đại lý ngoài tháng ' + (d.getMonth() + 1) + ' - ' + d.getFullYear();
  if (ss.getSheetByName(name)) // đã có (chạy lại trong cùng tháng) -> không ghi đè, thêm dấu thời gian
    name += ' (' + Utilities.formatDate(new Date(), 'GMT+7', 'dd-MM HH.mm') + ')';
  var cp = sh.copyTo(ss).setName(name);
  ss.setActiveSheet(cp); ss.moveActiveSheet(ss.getSheets().length); // đưa bản backup ra cuối
  ss.setActiveSheet(sh);
  if (sh.getLastRow() > 1) {
    var rg = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getMaxColumns());
    rg.breakApart(); // gỡ các ô Đại lý đã merge trước khi xóa
    rg.clear();
  }
}

// Chạy tay 1 lần để đăng ký trigger 06:00 sáng ngày 1 hằng tháng (xóa trigger cũ nếu có)
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'monthlyRotate') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('monthlyRotate').timeBased().onMonthDay(1).atHour(6).create();
}
