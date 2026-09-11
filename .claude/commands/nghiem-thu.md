---
description: Nghiệm thu 5 phòng (Kỹ Thuật · Điểm Số · Bảo Mật · Giao Diện · Vận Hành) trước khi commit — theo NGHIEM-THU.md
---

Chạy NGHIỆM THU cho thay đổi hiện tại theo đúng quy trình trong `NGHIEM-THU.md` (đọc file đó trước).

Phạm vi: $ARGUMENTS (để trống = mọi thay đổi chưa commit: `git diff HEAD` + file mới chưa theo dõi, bỏ qua `dashboard_v2.html`).

Các bước:
1. Đọc `NGHIEM-THU.md` và các mục liên quan trong `CLAUDE.md`. Lấy diff, xác định phòng nào phải chạy
   (Kỹ Thuật, Bảo Mật, Vận Hành LUÔN chạy; Điểm Số / Giao Diện theo bảng trong NGHIEM-THU.md).
2. Giao cho mỗi phòng một agent riêng, chạy SONG SONG. Mỗi agent nhận: vai trò + phạm vi soi của phòng,
   danh sách file đổi, luật lập biên bản (mục 3 của NGHIEM-THU.md — bắt buộc kịch bản hỏng cụ thể,
   `file:dòng`, mức PHẢI LÀM LẠI / PHẢI ĐIỀU CHỈNH / GHI NHẬN). Agent phải đọc code thật, không đoán.
3. Gom biên bản. Tự kiểm lại từng phát hiện trong code: loại phát hiện không có kịch bản hoặc bị code bác bỏ.
4. Chạy chốt 1: `test/kiem-tra.html` qua preview server `static` — báo số đạt/hỏng.
5. Kết luận theo mục 3.4: còn PHẢI LÀM LẠI / PHẢI ĐIỀU CHỈNH ⇒ "CHƯA ĐƯỢC ĐƯA LÊN" và liệt kê; ngược lại "ĐẠT".
   KHÔNG tự sửa code trong lệnh này trừ khi người dùng yêu cầu.
