/**
 * BÁO CÁO ĐẠI LÝ BẤT THƯỜNG → GOOGLE SHEET (SANJI / NEW88)
 * Sheet đích: https://docs.google.com/spreadsheets/d/1SnmzU9p0lhNWf7es7_SXVInWcPPl78cc7IzQdnAsD7E/edit?gid=1340440362
 *
 * ============ HƯỚNG DẪN CÀI ĐẶT (làm 1 lần, ~3 phút) ============
 * 1. Mở đúng Google Sheet trên → menu "Tiện ích mở rộng" (Extensions) → "Apps Script".
 * 2. Xóa code mẫu, dán TOÀN BỘ file này vào, bấm Lưu (Ctrl+S).
 * 3. Menu trái "Cài đặt dự án" (Project Settings) → Múi giờ (Time zone) chọn
 *    (GMT+07:00) Ho Chi Minh / Bangkok — để trigger chạy đúng "sáng 1 tây".
 * 4. Bấm "Triển khai" (Deploy) → "Tùy chọn triển khai mới" (New deployment) → loại "Ứng dụng web" (Web app):
 *      - Thực thi bằng (Execute as): Tôi (Me)
 *      - Ai có quyền truy cập (Who has access): Bất kỳ ai (Anyone)
 *    → Deploy → duyệt quyền → COPY "URL ứng dụng web" (dạng https://script.google.com/macros/s/.../exec)
 *    → gửi URL đó cho Claude dán vào BC.GS_WEBAPP_URL trong dashboard_v2.html.
 * 5. Trên thanh công cụ editor: chọn hàm "setupTrigger" → bấm Run (1 lần duy nhất)
 *    → bật tự động backup 06:00 sáng ngày 1 hằng tháng.
 *
 * Backup hằng tháng: sáng ngày 1, sheet hiện tại được NHÂN BẢN thành
 * "Báo cáo đại lý ngoài tháng <tháng vừa kết thúc> - <năm>" rồi sheet gốc bị xóa
 * dữ liệu, CHỪA LẠI DÒNG 1 (tiêu đề) để nhận báo cáo tháng mới.
 */

var SHEET_GID = 1340440362;      // gid của sheet nhận báo cáo (trên URL)
var TOKEN     = 'sanji-bc-2026'; // phải trùng BC.GS_TOKEN trong dashboard_v2.html

var HEADERS = ['STT','Đại lý','Tên tài khoản','Cấp bậc','Họ tên đăng kí','Khách','Chỉ tiêu','Cổng',
  'Tổng nạp','Lần nạp','Tổng rút','Lần rút','Âm/Dương','Cược hợp lệ','Ngân hàng','Chi nhánh',
  'STK','IP','Khu vực','IP đăng ký','IP đăng nhập','Thiết bị','Sảnh'];

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shs = ss.getSheets();
  for (var i = 0; i < shs.length; i++) if (shs[i].getSheetId() === SHEET_GID) return shs[i];
  return shs[0];
}

// Nếu dòng 1 trống thì tự ghi tiêu đề (nền cam, chữ đậm) — bình thường dòng 1 luôn được giữ lại
function ensureHeader_(sh) {
  var first = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (String(first[0] || '') !== '') return;
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setBackground('#F4B084').setFontWeight('bold')
    .setFontFamily('Arial').setFontSize(10).setHorizontalAlignment('center')
    .setBorder(true, true, true, true, true, true);
}

// Nhận báo cáo từ dashboard: {token, by, rows[][], colors[][], bolds[][]}
function doPost(e) {
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (b.token !== TOKEN) return out_({ ok: false, error: 'Sai token' });
    var rows = b.rows || [];
    if (!rows.length) return out_({ ok: false, error: 'Không có dòng dữ liệu' });
    var sh = getSheet_();
    ensureHeader_(sh);
    var start = sh.getLastRow() + 1, nc = rows[0].length;
    var rg = sh.getRange(start, 1, rows.length, nc);
    rg.setNumberFormat('@')            // giữ STK/ID dạng chữ, không mất số 0 đầu
      .setValues(rows)
      .setFontFamily('Arial').setFontSize(10).setFontColor('#000000')
      .setHorizontalAlignment('center')
      .setBorder(true, true, true, true, true, true);
    if (b.colors && b.colors.length === rows.length) rg.setBackgrounds(b.colors);
    if (b.bolds && b.bolds.length === rows.length)
      rg.setFontWeights(b.bolds.map(function (r) { return r.map(function (x) { return x ? 'bold' : 'normal'; }); }));
    return out_({ ok: true, added: rows.length, by: b.by || '' });
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
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getMaxColumns()).clear();
}

// Chạy tay 1 lần để đăng ký trigger 06:00 sáng ngày 1 hằng tháng (xóa trigger cũ nếu có)
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'monthlyRotate') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('monthlyRotate').timeBased().onMonthDay(1).atHour(6).create();
}
