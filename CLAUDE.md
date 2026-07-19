# CLAUDE.md — Bản đồ dự án SANJI / NEW88 Dashboard

> File này là BẢN ĐỒ để định vị nhanh code, tránh phải đọc lại toàn bộ `dashboard_v2.html` (4.779 dòng).
> Khi sửa: đọc bản đồ → nhảy tới vùng dòng liên quan → chỉ đọc vùng đó → sửa.
> **Số dòng sẽ lệch dần sau khi chỉnh sửa** — nếu lệch, `Grep` tên hàm/marker gần nhất để định vị lại, rồi cập nhật số ở đây.

## Tổng quan
- Dashboard 1 file HTML tĩnh cho đội vận hành cá cược (NEW88/SANJI).
- Hosting: **GitHub Pages** (repo `ttsanjinew88-boop/SANJI-quanlyne`, **PHẢI để public** — gói Free).
- Backend: **Supabase** (Postgres + Auth + Storage + Edge Functions). Anon key công khai nhưng an toàn nhờ RLS.
- File chính duy nhất: `dashboard_v2.html`. Không có build step.

## Quy tắc & lưu ý sống còn (đọc trước khi sửa)
- Chỉ **1 bot Telegram** duy nhất. Không tạo bot thứ 2.
- **Không để secret** (token/service_role) trong HTML. Chỉ anon key.
- Khi backup Storage: **loại bỏ 3 cột G/H/I** (`stripSensitiveCols`).
- Đơn có tích xanh ✅ (cột F chứa ký tự U+2705) **< 7000 không tính điểm/đơn**.
- User tự sửa format tin nhắn Telegram trong `index.ts` (biến `txt`) — đừng tự ghi đè.
- User **tự chạy SQL** và **tự deploy Edge Function**. Không tự làm hộ.
- **Đừng sửa file trực tiếp trên GitHub** khi Claude đang sửa local (gây lệch, phải `git pull --rebase`).
- Deploy: `git commit → push → chờ GitHub Actions`. Poll API `until grep '"conclusion"'`.

## Bố cục file `dashboard_v2.html`
| Vùng | Dòng | Nội dung |
|---|---|---|
| CSS | 14–438 | `<style>`; biến theme ở `:root{` dòng **15** (galaxy dark) |
| HTML body | 439–981 | Toàn bộ giao diện (modal, login, tabs, các trang) |
| JS khối 1 (T1 – hệ thống chính) | 982–3788 | Logic hiệu suất nhân viên |
| HTML T2 (Báo cáo đại lý) | 3790–3999 | Tab gửi file đại lý |
| JS khối 2 (T2 – BC tool) | 4001–hết | Logic báo cáo đại lý |

### Biến theme CSS (`:root`, dòng 15)
`--bg --card --card2 --border --border2 --pu(#7c3aed) --pu2(#9f67ff) --bl(#3b82f6) --bl2 --cy(#06b6d4) --gr --go(#f59e0b) --re --pk --tx --mu --mu2 --vip-c(#06b6d4) --onl-c(#a78bfa)`
→ Khi thêm UI, dùng các biến này (KHÔNG hardcode màu vàng/teal của PROMAX).

## Các TAB (HTML) và hàm render tương ứng
Điều hướng tab: `sw(pg,el)` (dòng 2638) → gọi `rAll()` (2795).

| Tab (nút) | id trang | HTML | Render chính |
|---|---|---|---|
| Dữ Liệu | `pg-data` | 582–670 | `rDataTab()` 2653 |
| Hiệu Suất KO | `pg-ko` | 672–797 | `rKO()` 3196 |
| Phân Ca | `pg-shift` | 799–883 | `rShift()` 3676 |
| Xếp Hạng | `pg-rank` | 913–928 | `rRank()` 3726 |
| Lịch Sử | `pg-log` | 930–937 | `rLogPanel()` 1752 |
| Quản Trị (admin) | `pg-admin` | 939–981 | `rAdminPanel()` 1424 |
| Báo Cáo Đại Lý (T2) | trong t2 | 3790–3999 | `switchTool()` 4003, `BC.*` |

## Bản đồ chức năng → hàm (số = dòng bắt đầu)

### Tiện ích chung
`ha` 1006 (hex→rgba) · `nn` 1007 (số VN) · `hesc` 1009 (escape HTML) · `co/coL` 1045/1046 (config Chart.js) · `m31x24` 2308 · `hrs` 1044 (dải giờ).

### Supabase / Auth / Quyền
- `SB` (module) 1053: `saveReport` 1061, `uploadOriginals` 1067, `listReports` 1076, `loadReport` 1082.
- Profile/quyền: `CUR_PROFILE` 1100, `canView` 1108, `canEdit` 1109, `curPerms` 1383, `applyPerms` 1388, `roleOf` 1117.
- `logAction` 1111 (ghi audit) · `sessionExpired` 1125.
- IP: `fetchMyIP` 1131, `ipAllowed` 1141, `showIpBlocked` 1152.
- Login/2FA flow: `AUTH` init ~1160+ (đăng nhập, kiểm 2FA, ép thiết lập 2FA). QR: thư viện `qrcode-generator`.

### 2FA (Google Authenticator)
`open2faModal` 1566, `start2faEnroll` 1583, `confirm2faEnroll` 1599, `disable2fa` 1611, `copy2faSecret` 1622, `admReset2fa` 1628 (TT/admin reset của người khác). Label hiển thị: "He Thong NE: TÊN - DD/MM/YY".

### Quản Trị (admin panel)
`rAdminPanel` 1424, `admLoadUsers` 1455, `admCreateUser` 1799, `admSetRole` 1770, `admSetAdmin` 1784, `admSetPermLevel` 1517, `admChangePw` 1533, `selfChangePw` 1548.
White IP: `admLoadIps` 1644, `admAddIp` 1656, `admDelIp` 1674. Khóa TK: `admToggleLock` 1686.
Xóa/xuất tháng: `admFillDelMonths` 1696, `admExportMonth` 1707, `admDeleteMonth` 1730.

### Tháng / nạp dữ liệu
`curMonthKey` 1834, `emptyDataset` 1838, `bootData` 1871, `normMonth` 1915, `dispMonth` 1917.
Lịch sử tháng: `toggleHistMenu` 1995, `loadHistMonth` 2025.

### Upload & parse Excel (Duyệt Đơn / Khuyến Mãi)
- Chọn kiểu upload: `toggleUploadMenu` 2234, `pickUploadType` 2238, `processFiles` 2275.
- Pipeline: `initAccum` 2309 → `processChunks` 2337 (parse từng dòng) → `mergeAccum` 2438 → `finalizeResult` 2587.
- Chế độ cộng dồn theo ngày: `applyAddMode` 2543, `dsAddInto` 2480, `dsSubtractDay` 2508, `dsRecalcDays` 2528, `dsDaysPresent` 2473.
- Lưu: `saveMonthData` 2535, `cloudSaveKO` 1939, `stripSensitiveCols` 1926.
- Cột Duyệt Đơn (0-based): B(1)=lần đầu/thứ, D(3)=member, F(5)=Cấp độ(✅), J(9)=submit GMT-4, P(15)=amount, R(17)=status, T(19)=process GMT-4, U(20)=FK note. GMT-4→GMT+7 cộng 11h.

### TAB Dữ Liệu (Ngày/Tháng/Giờ + Báo Cáo Đơn Rút)
- Nguồn dữ liệu: `dataSrc` 2643 ('don'/'km'), `sds` 2645 (đổi nguồn), `curDataSet` 2652.
- Sub-tab Duyệt Đơn: `donSub` 2644 ('time'|'donrut'), `setDonSub` 2651, `rDataTab` 2653.
- **Báo Cáo Đơn Rút** (port đầy đủ từ PROMAX, **SESSION-ONLY** — không lưu cloud, F5 là mất): module `DR` (grep `const DR={`) giữ `DR.raw/DR.data/DR.brackets/DR.sortBy` trong RAM. Có ô thả file/dán/chọn file RIÊNG (`drDrop/drFile/drPick`, wire bằng IIFE cuối module) — độc lập với upload chính. Chức năng: sửa mốc tiền (`drOpenBrModal/drApplyBr/drResetBr` + modal `#drBrModal`), sort (`drSort` total/first/name), tìm FK+cấp độ. Thẻ FK gọn (chỉ header) → bấm mở **popup** `drOpenFk`/`drCloseFk` (modal `#drFkModal`, `DR.fkModalHTML`): mốc tiền drill-down `drToggleBr` + Cấp độ thành viên + **bảng Tất cả đơn kèm ID đăng nhập (o.m) & Cấp độ TV (o.lv)**. Đóng bằng ✕ / nền tối / Esc. **Xin ý kiến TT (Telegram)**: ô dán text tĩnh trong stats-row (`#drTgText` + `drTgCheck`), `DR.parseTg` tách tin `[M/D/YYYY H:MM AM/PM] KO <TÊN> NE: <ID>...` (bỏ tin TT reply), `DR.parseMoney` (tr/triệu/k/số trần → nghìn), `DR.tgCheck` đối chiếu đơn ≥150k: khớp ID hội viên + đúng FK + lệch ≤10 phút GMT+7, `DR.renderTg` panel `#donrutTgPanel` (⚠ CHƯA XIN Ý KIẾN đỏ / ✔ xanh). Paste vào `drTgText` được loại khỏi handler dán Excel toàn cục. `DR.build` gộp gbr + fks{levels,brackets,orders}, LƯU MỌI đơn. Helper chung: `brLabelOf`, `fkLimitNum`, `fmtDurSec`, hằng `DR_DEFAULT_BR`. `rDonRut()`=`DR.render()`. Áp quy định ✅<7000. CSS `.dr-*` ở cuối khối style. **Đã gỡ donrut khỏi pipeline chính** (initAccum/processChunks/mergeAccum/dsAddInto).
- Thống kê KM: `rKmStat` 2747. Ngày/tháng: `bldDayBtns` 2804, `rDay` 2808, `rMonth` 2840, `rKoDaily` 2960.

### TAB Hiệu Suất KO
`rKO` 3196 điều hướng view (`koView`, `skv` 2641). Các view:
- Tổng quan: `rKoOverview` 3095, bảng thưởng/phạt `buildOvTable` 3018, `calcBonusPenalty` 2995, `ovFootHtml` 3074.
- Hạn mức: `LIMITS` 3245, `rKoLimit` 3246, `limSet` 3302, `_saveLimits` 3312.
- ~~Vượt hạn mức~~: **ĐÃ XOÁ view/tab riêng**. Cảnh báo vượt hạn mức giờ nằm TRONG Báo Cáo Đơn Rút: `DR.overLimitOrders` (amount > `fkLimitNum(fk)`) + `DR.renderOverLimit` (panel đỏ `#donrutOverLimit` + thẻ tổng thứ 5). Dùng `LIMITS` nạp sẵn ở boot.
- Bất thường: `KO_AN` 2081, `rKoAnomaly` 3169, `anSet/anGet/anTotal` 2100–2112, lưới `buildAnGridAbuse` 3115 / `buildAnGridMkt` 3140.
- KO_OV (cộng/trừ/ghi chú): `KO_OV` 2058, `ovGet` 2071, `ovSet` 2072, `_saveKoOvCloud` 2064.

### TAB Phân Ca / Công Việc
`rShift` 3676, `rShiftPanel` 3328, `sshv` 3344. Phân công: `WORK` 3355, `rWork` 3363, `wkSet` 3656, `wkAutoAssign` 3491, `wkAssignCore` 3438, `wkRebalanceFrom` 3502. OFF: `wkOffOpen` 3516, `wkOffConfirm` 3533. Dán Excel: `openPasteModal` 3580, `applyPaste` 3596.

### TAB Xếp Hạng
`rRank` 3726 (ẩn tên ngày 1–25 tháng hiện tại), `sFk` 3755, `rDC` 3756. Màu FK: `toggleFKColorPicker` 3769, `updateFKColor` 3779.

### Telegram (deep-link toast trong HTML)
`PENDING_URL` 2117, `showUrlToast` 2128, `processUrlAction` 2154. Chấm điểm THẬT nằm ở Edge Function (server quyết định), không ở HTML.

### T2 — Báo Cáo Đại Lý (BC tool)
`switchTool` (grep). Module `BC`: parse file, render `renderAll`, phân trang, Tổng Hợp (20 cột), Nghi Ngờ (`renderSuspects`, cột ẩn/hiện `SUSPECT_VIS`/`toggleSuspectCol` ~1109+). Xuất Excel `genExcel` (SpreadsheetML; style `h/d/a` + **`m`** cam tô + **`r`** đỏ nhạt Âm/Dương). Gửi Telegram report qua Edge Function.
- **Tô ô nghi ngờ — Kiểm Tra Đại Lý** (SESSION-ONLY, F5 mất): `BC.MARKS` (agent→Set "rowIdx|field"), `mkSet/mkAttr/markCell`; td trong `loadAgent` bấm để tô. CSS `.bc-mkc/.bc-mk/.bc-mk-ad` (cạnh `.bc-cu-trigger` ~358). `sendBatThuong` truyền `mkSet(agent)` → `genExcel(rows,agent,marks)` tô đúng ô trong file Telegram (cam #F4B084, Âm/Dương #FFC7CE). `BC.XLS_FIELDS` = thứ tự 23 cột dùng chung cho Excel + Google Sheet.
- **Nghi Ngờ**: tab mở cho **ADMIN + Tổ Trưởng** (`applyPerms` ~1478 + gate trong `renderSuspects`); đánh dấu/bỏ đại lý nghi ngờ vẫn chỉ ADMIN (`toggleSuspect`). Tô ô LƯU CLOUD: `BC.suspectMark` ghi `s.cellMarks` (["rowIdx|field"]) vào record `suspects`. Nút `#bcSusSheetBtn` (TT trở lên) → `BC.sendSuspectsToSheet`: POST JSON `{token,by,blocks:[{agent,rows:[{v:{field:value},mk:[field]}]}]}` (Content-Type text/plain tránh CORS preflight) tới `BC.GS_WEBAPP_URL` (ĐÃ điền URL Web App user deploy 18/07/2026), token `BC.GS_TOKEN='sanji-bc-2026'` phải trùng file .gs. Tiền gửi dạng chuỗi VN (`BC.fmt`).
- `google_sheet_baocao.gs` BẢN 2 (trong repo; user tự dán vào Apps Script của Sheet đích gid `1340440362`, hướng dẫn ở đầu file): `doPost` khớp field theo TIÊU ĐỀ HÀNG 1 (`HEADER_FIELD`, không còn cột Cổng/Khu vực), mỗi đại lý 1 khối cách 1 dòng trống (cách cả hàng tiêu đề) + merge cột Đại lý + viền ngoài khối MEDIUM, Tahoma 9 đậm, nền: tiêu đề/Đại lý `#F8CBAD`, ô tô `#F4B084`, Âm/Dương tô `#FFC7CE`, **Cấp bậc ĐỔI ĐẦU (`isDoiDau_`: "đổi/đối đầu"/DD-) TỰ ĐỘNG `#FFC7CE`**, thường `#FFF2CC`, ô trống điền "-"; dashboard gửi Thiết bị dạng "Máy Tính"/"Điện Thoại"; `monthlyRotate` trigger 06:00 ngày 1 hằng tháng — nhân bản sheet thành "Báo cáo đại lý ngoài tháng M - YYYY" (M = tháng vừa kết thúc) rồi breakApart + xóa dữ liệu chừa dòng 1; `setupTrigger` chạy tay 1 lần. **Sửa .gs xong user phải Deploy → Manage deployments → ✎ → New version** (URL không đổi).

## Backend (user tự chạy/deploy)
- `supabase_setup.sql` — bảng `reports`, RLS cơ bản.
- `supabase_auth_setup.sql` — Auth/profiles.
- `supabase_update2.sql` — `my_role`, `change_password`, `audit_log`.
- `supabase_update3.sql` — `login_security`, `login_fail/is_locked/set_lock/login_ok/get_whiteip`.
- `supabase_update4.sql` — `can_edit`, `can_write_report`, RLS ghi theo quyền.
- `supabase/functions/tg-webhook/index.ts` — deploy tên **`super-function`**. Xử lý: webhook callback (cộng điểm, rid dùng-1-lần), `send_report` (multipart, server chấm điểm), `reset_2fa`. Token ở secret `TG_BOT_TOKEN`.

Bảng `reports(type,month,data JSON)`. type: `don, km, shift, anomaly, work, limits, ov, suspects, whiteip, rids, bc`.

## Việc đang dở / chờ user
- ~~Gửi Nghi Ngờ → Google Sheet~~: **XONG** — user đã deploy Apps Script, URL đã điền vào `BC.GS_WEBAPP_URL`, endpoint test OK. (Nếu user sửa code .gs phải deploy lại: Deploy → Manage deployments → Edit → New version.)
- ~~Báo Cáo Đơn Rút~~: **XONG** — chuyển sang module `DR` session-only (không cloud, F5 mất), port đầy đủ PROMAX (sửa mốc tiền, sort, cấp độ, drill-down, thả/dán/chọn file riêng). "Vượt hạn mức" đọc từ `DR.data`.
- **Bot lắng nghe thụ động** (đọc text nhóm, nhận ID tài khoản rút ≥150k): CHỜ user cung cấp (a) mẫu/định dạng ID đăng nhập trong text, (b) group ID Telegram, (c) tắt privacy mode qua BotFather `/setprivacy`.
- Nhắc user: xóa điểm test (JADE ngày 15, "Đại lý ngoài"/mkt, tháng 7 = +3); deploy lại Edge Function cho `reset_2fa`; chạy `supabase_update4.sql`; thu hồi token bot cũ qua BotFather.
