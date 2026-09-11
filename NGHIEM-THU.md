# NGHIỆM THU — Hệ Thống NE

> Chốt chặn số 2 trong CLAUDE.md ("TRƯỚC KHI COMMIT"). Chạy bằng lệnh **`/nghiem-thu`** trong Claude Code
> (định nghĩa ở `.claude/commands/nghiem-thu.md`), hoặc làm tay theo đúng các bước dưới đây.
> Mục đích: một thay đổi chỉ được đưa lên bản chính khi **5 phòng** xem xét độc lập và không phòng nào
> còn phát hiện loại **PHẢI LÀM LẠI** / **PHẢI ĐIỀU CHỈNH**.

## 1. Phạm vi xét duyệt
- Mặc định: toàn bộ thay đổi CHƯA commit (`git diff HEAD` + file mới chưa theo dõi), bỏ qua `dashboard_v2.html`
  (file sinh ra — xét `src/` là đủ, rồi kiểm "build xong `git diff dashboard_v2.html` phải khớp").
- Có thể chỉ định một nhánh / một dải commit khác.

## 2. Năm phòng
| Phòng | Khi nào chạy | Soi cái gì |
|---|---|---|
| **Kỹ Thuật** | LUÔN | Lỗi logic, giá trị biên, bất đồng bộ (await xen giữa, bộ hẹn giờ, đổi tháng giữa chừng), ghi đè dữ liệu người khác/máy khác, nuốt lỗi |
| **Điểm Số** | khi đụng `upload.js`, `data-boot.js` (chấm điểm/dataset), `render.js` (điểm/hạn mức/bất thường), roster, Edge Function cộng điểm | Bảng điểm `gsc`, roundV2, cộng dồn ngày, nhận diện FK (`mfk`), điểm Bất Thường/Telegram — mọi thứ làm điểm của một người sai hoặc mất |
| **Bảo Mật** | LUÔN | Bí mật lọt vào repo PUBLIC (token, service_role, domain hậu đài, ID nhóm Telegram, IP), quyền chỉ ẩn nút mà không chặn ở RLS/RPC, XSS (chuỗi người dùng vào `innerHTML` không qua `hesc`), `externally_connectable` |
| **Giao Diện** | khi đụng HTML/CSS/chuỗi hiển thị | Quy ước nút `.abtn` / tab `.tab` / chip (CLAUDE.md), song ngữ (chuỗi mới có trong `I18N.EN`/`I18N.RX`, không trùng khoá, không `.toUpperCase()` trong JS), bố cục không vỡ |
| **Vận Hành** | LUÔN | Cần user chạy SQL / deploy Edge Function / đổi secret không (ghi rõ), sao lưu có còn đủ, `VAN-HANH.md` và CLAUDE.md có cần cập nhật, đường ghi mới có gọi `saveFailed` không |

## 3. Luật lập biên bản
1. Mỗi phát hiện **BẮT BUỘC** có **kịch bản hỏng cụ thể**: ai làm gì, theo thứ tự nào, dữ liệu vào là gì
   → hậu quả thấy được (điểm sai bao nhiêu, dữ liệu nào mất, màn hình báo sai điều gì).
   **Không có kịch bản thì bị loại khỏi biên bản** — "có thể có vấn đề", "nên cân nhắc" không được tính.
2. Mỗi phát hiện kèm vị trí `file:dòng` và một trong ba mức:
   - **PHẢI LÀM LẠI** — hướng làm sai, sửa vá không đủ.
   - **PHẢI ĐIỀU CHỈNH** — đúng hướng nhưng có lỗi phải sửa trước khi đưa lên.
   - **GHI NHẬN** — không chặn việc đưa lên (nợ kỹ thuật, rủi ro chấp nhận được) — ghi rõ lý do chấp nhận.
3. Phát hiện của phòng này mà phòng khác bác được bằng chứng cứ trong code thì bị loại.
4. Kết luận chung:
   - Còn ≥1 **PHẢI LÀM LẠI / PHẢI ĐIỀU CHỈNH** ⇒ **CHƯA ĐƯỢC ĐƯA LÊN**. Sửa xong chạy lại nghiệm thu
     (ít nhất các phòng đã nêu phát hiện + Kỹ Thuật).
   - Chỉ còn **GHI NHẬN** ⇒ **ĐẠT**.

## 4. Sau khi ĐẠT
1. `test/kiem-tra.html` toàn bộ xanh (chốt 1).
2. Phát hiện nào sửa được bằng máy canh ⇒ thêm phép kiểm vào `test/kiem-tra.html`, **đừng thêm dòng ⚠ vào CLAUDE.md**.
3. `build.ps1` → commit cả `src/` lẫn `dashboard_v2.html` (chốt 3).

## 5. Biên bản mẫu
```
PHÒNG KỸ THUẬT
[PHẢI ĐIỀU CHỈNH] src/js/data-boot.js:443 — lưu Bất Thường ghi đè nguyên bảng
  Kịch bản: TT để tab dashboard ẩn → nhóm Telegram bấm Xác Nhận +2 cho JADE → TT quay lại, sửa 1 ô trong
  60s đầu → bảng trong máy (cũ) đè lên máy chủ → JADE mất 2 điểm, thanh trạng thái vẫn "✓".
KẾT LUẬN: CHƯA ĐƯỢC ĐƯA LÊN (1 phát hiện phải điều chỉnh)
```
