# SỔ TAY VẬN HÀNH — Hệ Thống NE

> **Dành cho ai:** người phụ trách thứ hai, **không cần biết lập trình**.
> Mục đích: khi người chính vắng mặt, vẫn có người biết chuyện gì đang xảy ra và gọi ai.
>
> ⚠ **KHO MÃ NÀY LÀ CÔNG KHAI — ai cũng đọc được file này.**
> Tuyệt đối KHÔNG ghi vào đây: mật khẩu, token, địa chỉ hậu đài, ID nhóm Telegram, khoá `.pem`.
> Chỉ ghi **chỗ tìm**, không ghi **giá trị**.

---

## 1. Hệ thống gồm những gì

| Bộ phận | Nó là gì | Nằm ở đâu | Hỏng thì hậu quả |
|---|---|---|---|
| **Dashboard** | Trang web nhân viên dùng hằng ngày | GitHub Pages (kho `SANJI-quanlyne`) | Không ai vào làm việc được |
| **Cơ sở dữ liệu** | Nơi chứa TOÀN BỘ điểm số, phân ca, quy trình, bài test | Supabase | **Mất là mất hết** — mục 4 |
| **Bot Telegram** | Gửi báo cáo, nhận nút xác nhận, nhắc nhở | Supabase Edge Function | Báo cáo không gửi được, điểm bất thường không cộng |
| **Extension Cảnh Báo NE** | Tô màu dấu hiệu lạm dụng trên trang hậu đài | Cài tay trên máy từng nhân viên | Nhân viên phải tự soi bằng mắt |

**Chỉ có 1 bot Telegram duy nhất.** Không bao giờ tạo bot thứ hai.

---

## 2. Những thứ MẤT LÀ KHÔNG LẤY LẠI ĐƯỢC

Ba thứ dưới đây phải luôn có **ít nhất 2 bản** ở 2 nơi khác nhau.

### 2.1. Khoá extension `.pem`
- **Là gì:** file chứng minh extension "Cảnh Báo NE" là hàng thật.
- **Mất thì sao:** phải tạo khoá mới → mã extension đổi → **cả 20 máy phải cài lại từ đầu**, và mọi cài đặt riêng của nhân viên (khung cảnh báo, nhóm từ khoá tự tạo) mất sạch.
- **Chỗ cất hiện tại:** trên Desktop máy người phụ trách chính (ngoài kho mã).
- ✅ **VIỆC CẦN LÀM NGAY:** chép thêm 2 bản — 1 USB cất tủ, 1 trong trình quản lý mật khẩu. **Không bao giờ đưa file này vào kho mã.**

### 2.2. Tài khoản quản trị Supabase
- Đây là chìa khoá vào toàn bộ dữ liệu.
- Cất trong trình quản lý mật khẩu, có bật xác thực 2 lớp.
- Ít nhất 2 người phải vào được.

### 2.3. Bản sao lưu dữ liệu hằng tháng
- Xem mục 4.

---

## 3. Việc định kỳ

| Khi nào | Việc | Ai làm | Mất bao lâu |
|---|---|---|---|
| **Ngày 1 hằng tháng** | Tải bản sao lưu tháng vừa kết thúc (mục 4.1) | Quản trị | 2 phút |
| **Mỗi lần sửa phần điểm số** | Chạy bộ kiểm tra tự động (mục 5) | Người sửa | 1 phút |
| **Mỗi lần ra bản extension mới** | Báo nhân viên cài lại, kiểm lại đủ 20 máy | Quản trị | 30 phút |
| **3 tháng một lần** | Mở thử một bản sao lưu cũ xem có đọc được không | Quản trị | 5 phút |

> Bản sao lưu chưa từng được mở thử thì **chưa phải bản sao lưu** — chỉ là một file mà ta hy vọng là đúng.

---

## 4. Sao lưu và khôi phục

### 4.1. Tải bản sao lưu (làm hằng tháng)
1. Đăng nhập dashboard bằng tài khoản ADMIN
2. Vào tab **Quản Trị**
3. Ở khung xoá/xuất tháng, chọn tháng cần lưu
4. Bấm **Tải sao lưu JSON**
5. **Nhìn dòng thông báo ngay dưới nút:**
   - **XANH** — *"Đã tải file sao lưu tháng … ✓ — N mục của tháng · M mục dùng chung · K dòng bài test"* → bản sao lưu đủ.
   - **ĐỎ** — *"Đã tải file nhưng THIẾU … phần"* → bản sao lưu **KHÔNG đủ**. Đừng coi là đã sao lưu; báo người kỹ thuật (danh sách phần thiếu nằm ngay trong file, mục `missing`).
6. Cất file vào thư mục sao lưu (nên đặt trong Google Drive / OneDrive để tự đồng bộ)

Tên file có dạng `sanji_backup_<năm>-<tháng>.json`.

> ⚠ **File sao lưu chứa thông tin nhạy cảm**: danh sách IP được phép đăng nhập, ID Telegram được bấm xác nhận, đáp án bài kiểm tra nghiệp vụ. Cất như tài liệu mật — **không gửi qua nhóm chat, không để thư mục chia sẻ công khai**.

### 4.2. Khi cần khôi phục
Việc này **phải do người biết kỹ thuật làm**. Người phụ trách thứ hai chỉ cần:
1. Tìm file sao lưu của tháng cần khôi phục
2. Gửi file đó cho người kỹ thuật
3. **Không tự ý bấm gì trong tab Quản Trị** — nút xoá tháng ở ngay cạnh đó và không hoàn tác được

### 4.3. Bản sao lưu CÓ gì và KHÔNG có gì (cập nhật 10/09/2026)
**Có** — mỗi lần bấm ra một file gồm:
- **Mọi dữ liệu của tháng đã chọn**: điểm Duyệt Đơn, Khuyến Mãi, Bất Thường, Tổng Quan, Hạn Mức, Phân Ca, Công Việc, lịch sử hoàn tác phân ca, danh sách nhân viên của tháng, báo cáo đại lý
- **Mọi dữ liệu dùng chung** (không theo tháng): toàn bộ chữ trong Quy Trình Làm Việc, nhóm cảnh báo của extension, danh sách đại lý nghi ngờ, danh sách IP được phép, ID Telegram được bấm xác nhận, cấu hình nhắc nhở Telegram, danh sách nhân viên dùng chung cũ
- **Toàn bộ bài kiểm tra nghiệp vụ**: chủ đề, câu hỏi, bài đã nộp, điểm chấm

⇒ Phần dùng chung có trong **mọi** file; phần theo tháng thì mỗi tháng một file — vì vậy vẫn phải tải **mỗi tháng một lần**.

**Không có:**
- Ảnh trong tab Quy Trình Làm Việc và ảnh câu hỏi bài test (nằm ở kho ảnh riêng của Supabase)
- Báo Cáo Đơn Rút và Lọc File NTK — hai tab này **không lưu gì cả**, tắt trình duyệt là mất, đó là chủ ý

---

## 5. Bộ kiểm tra tự động

Trước khi đưa bất kỳ thay đổi nào liên quan tới **điểm số / upload Excel / danh sách nhân viên** lên bản chính:

1. Mở PowerShell tại thư mục dự án
2. Gõ `.\.claude\serve.ps1`
3. Mở trình duyệt vào `http://localhost:8788/test/kiem-tra.html`
4. **Toàn bộ phải xanh.** Còn một dòng đỏ là không được đưa lên.

Bộ kiểm tra này canh những quy tắc đã từng gây sự cố thật: bảng điểm, làm tròn theo ngày, nhận diện nhân viên từ ghi chú Excel, cộng dồn theo ngày, nhân viên thêm giữa tháng, đổi tháng, sao lưu, và điểm Bất Thường từ Telegram.

---

## 6. Khi hệ thống hỏng — làm gì

### 6.1. "Không ai vào được dashboard"
1. Thử mở bằng máy khác / mạng khác (có thể chỉ là mạng của một người)
2. Vào GitHub, kho `SANJI-quanlyne`, tab **Actions** — nếu lần chạy mới nhất màu đỏ thì bản vừa đưa lên bị lỗi
3. **Cách chữa nhanh nhất:** ở tab Actions, chạy lại lần triển khai **thành công gần nhất** (Re-run). Trang sẽ quay về bản cũ chạy được.
4. Báo người kỹ thuật

### 6.2. "Đăng nhập được nhưng không thấy dữ liệu"
- Gần như chắc chắn là Supabase gặp sự cố, không phải dashboard
- Kiểm tra trang trạng thái của Supabase
- **Không upload lại gì cả** trong lúc này — dễ ghi đè lên dữ liệu đúng

### 6.3. "Điểm của một bạn bị sai / biến mất"
1. **Không upload lại ngay.** Ghi lại: tên ai, tháng nào, ngày nào, sai bao nhiêu
2. Vào tab **Lịch Sử** xem gần đây ai đã làm gì với tháng đó
3. Tải bản sao lưu tháng đó về (mục 4.1) trước khi động vào bất cứ thứ gì
4. Báo người kỹ thuật kèm 3 thông tin ở bước 1

> Riêng **điểm Bất Thường**: trước 11/09/2026, Tổ Trưởng sửa một ô trên dashboard có thể xoá mất điểm vừa xác nhận qua Telegram. Đã sửa — nếu thấy điểm Telegram mất ở ngày trước 11/09 thì đối chiếu tab **Lịch Sử** (dòng "Xác nhận bất thường (Telegram)") để cộng bù.
>
> Nguyên nhân hay gặp nhất: có người đổi **Mã Excel** của nhân viên, hoặc **ẩn** một nhân viên. Cả hai đều làm các lần upload SAU đó nhận nhầm người.

### 6.4. "Bot Telegram không gửi báo cáo"
- Kiểm tra bot còn trong nhóm không (có thể bị mời ra)
- Báo người kỹ thuật — cần vào Supabase xem nhật ký hàm

### 6.5. "Nhân viên báo cáo OFF mà không lưu được"
- Từ 08/09/2026 hệ thống đã báo lỗi rõ ràng thay vì im lặng. Nếu hiện bảng lỗi màu đỏ, **chụp màn hình bảng đó** rồi gửi người kỹ thuật — trong đó có nguyên nhân.

---

## 7. Ba việc TUYỆT ĐỐI KHÔNG LÀM

1. **Không sửa file trực tiếp trên GitHub** khi người kỹ thuật đang sửa ở máy — hai bên đè nhau, rất khó gỡ.
2. **Không bấm "Xoá dữ liệu tháng"** trong tab Quản Trị nếu chưa tải sao lưu. Không có hoàn tác.
3. **Không đưa mật khẩu, token, địa chỉ hậu đài hay khoá `.pem` vào kho mã.** Kho này công khai.

---

## 8. Liên hệ

| Vai trò | Ai | Cách liên hệ |
|---|---|---|
| Phụ trách kỹ thuật chính | *(điền tên)* | *(điền)* |
| Phụ trách thứ hai | *(điền tên)* | *(điền)* |
| Quản trị Supabase | *(điền tên)* | *(điền)* |

> ✅ **Điền bảng này ngay.** Một sổ tay vận hành không có tên người là một tờ giấy trắng.

---

## 9. Muốn hiểu sâu hơn

- `CLAUDE.md` — bản đồ kỹ thuật đầy đủ (dành cho người lập trình)
- `NGHIEM-THU.md` — quy trình nghiệm thu trước khi đưa tính năng lên bản chính
- `test/kiem-tra.html` — bộ kiểm tra tự động
