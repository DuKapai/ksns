# KSNK Network – Demo quản lý Mạng lưới Kiểm soát nhiễm khuẩn

Ứng dụng demo Angular + Node.js, chưa yêu cầu SQL/database. Dữ liệu demo được lưu ở `server/data/demo-store.json` bằng JSON để thử luồng nghiệp vụ. Backend là nơi duy nhất đọc/ghi dữ liệu; Angular không kết nối trực tiếp HIS.

## 1. Chạy thử nhanh

**Bản dùng thử trực tuyến:** https://DuKapai.github.io/ksns/

Mở link là dùng được ngay trên điện thoại hoặc máy tính, không cần đăng nhập, không cần cài gì. Cuối trang có 3 nút **Thành viên mạng lưới / Nhân viên y tế / Khoa KSNK** để đổi vai trò và thử trọn luồng: tạo phiếu → phản hồi → xử lý → xác nhận. Dữ liệu chỉ lưu trên trình duyệt đang dùng, không chia sẻ giữa các máy; chỉ nhập dữ liệu giả.

Yêu cầu: Node.js 20.19+ (khuyến nghị Node 22 LTS) và npm.

```bash
# tại thư mục gốc
npm install
npm run install:all
npm run dev
```

Mở `http://localhost:4200`: vào thẳng **Trang chủ** của module, không có màn hình đăng nhập hay chọn phân hệ (trong MyHV, người được cấp quyền vào thẳng module). API chạy tại `http://localhost:3000`.
Lệnh `npm run dev` bật **phiên mẫu** ở backend (`DEMO_AUTO_LOGIN=true`), chỉ dùng với dữ liệu giả trên máy cục bộ. `npm start` không bật tính năng này; biến này cũng bị vô hiệu khi `NODE_ENV=production`.

Trên Windows có thể chạy `setup.bat` một lần, sau đó chạy `run-demo.bat`.

Lần chạy đầu, backend tự tạo `server/data/demo-store.json` từ `server/data/seed.json`. Muốn **làm lại dữ liệu mẫu**: dừng server → xóa `server/data/demo-store.json` → chạy lại (server giữ dữ liệu trong bộ nhớ nên phải dừng trước khi xóa).

## 2. Giao diện

Chỉ có một module với 4 mục; mỗi người chỉ thấy mục mình dùng được:

| Mục | Ai thấy | Dùng để |
|---|---|---|
| **Trang chủ** | Tất cả | 2 nút lớn **Ghi nhận giám sát** / **Ghi nhận vấn đề**, 4 ô số liệu, danh sách **Cần làm**, bảng **Số liệu**, **Hoạt động gần đây** |
| **Phiếu** | Tất cả | Danh sách phiếu vấn đề; mỗi phiếu có **một nút chính** cho bước tiếp theo của người đang xem |
| **Báo cáo** | Thành viên mạng lưới, KSNK | Báo cáo tháng tự tổng hợp, chỉ cần bấm **Xác nhận báo cáo**; tổng hợp theo kỳ và tải CSV |
| **Quản lý** | Khoa KSNK | Ba mục nhỏ **Thành viên / Hạn báo cáo / Lịch sử**, mỗi lần chỉ hiện một mục |

Đường dẫn cũ tới thành viên, lịch sử và thiết lập mở mục tương ứng trong cùng giao diện; đường dẫn không còn hỗ trợ về Trang chủ. Không mở lại thanh menu hay màn hình cũ. Cuối trang, mở **Đổi người dùng thử** để thử 3 vai trò mẫu: *Thành viên mạng lưới* (bác sĩ, khoa mô phỏng), *Nhân viên y tế* (người được nêu tên trên phiếu), *Khoa KSNK*.

- **Cần làm** chỉ liệt kê việc người đang xem có thể thực hiện; bấm nút để làm ngay, không qua màn hình trung gian.
- Phiếu ghi rõ ai làm tiếp; **Đang theo dõi** bao gồm cả phiếu đang xử lý và chờ KSNK xác nhận. Hết tháng vẫn xem được lịch sử phản hồi, kèm thông báo đã hết hạn.
- Báo cáo không yêu cầu nhập lại số liệu. Bảng đã xác nhận mặc định theo tháng báo cáo đang chọn; **Tải bảng này** xuất đúng các dòng và tổng đang hiển thị. Thành viên chỉ thấy báo cáo của mình; lãnh đạo khoa/KSNK theo dõi theo quyền.
- Nếu chưa có lịch giám sát, giao diện ghi **chưa có lịch**, không diễn giải thành đã hoàn thành. Tỷ lệ làm đúng không tự báo đỏ theo ngưỡng chưa được phê duyệt.

### Phiếu ghi nhận

- **Ghi nhận giám sát:** chọn nội dung → nhập số lần quan sát và số lần làm đúng → tỷ lệ hiện ngay. Chỉ khi chưa đúng hết mới hỏi thêm "Chưa đúng ở điểm nào?".
- **Ghi nhận vấn đề:** chọn nội dung, mức độ (**Nhẹ / Trung bình / Nguy hiểm**), mô tả ngắn, người liên quan (nếu có). Mục *Thêm chi tiết* (không bắt buộc): đã xử lý ngay, hạn khắc phục. Người lập và khoa lấy từ phiên, không phải nhập.
- Chỉ thành viên mạng lưới đang hoạt động mới lập được phiếu.

### Các bước xử lý một vấn đề

| Trạng thái hiển thị | Ai làm bước tiếp | Nút |
|---|---|---|
| Chờ tiếp nhận | Khoa KSNK | **Tiếp nhận** (1 lần bấm) |
| Đang xử lý | Khoa có vấn đề (trưởng khoa/thành viên) | **Báo đã xử lý** (ghi cách xử lý + minh chứng) |
| Chờ xác nhận | Khoa KSNK | **Xác nhận kết quả**: Đạt → Hoàn thành; Chưa đạt (ghi lý do) → quay lại Đang xử lý |
| Hoàn thành | — | — |

- Người được nêu tên trên phiếu nhận thông báo và bấm **Phản hồi** (ý kiến + minh chứng). Được phản hồi **đến hết tháng tạo phiếu** (giờ Việt Nam); sang tháng sau máy chủ khóa gửi mới, không xóa lịch sử. Phản hồi không tự hủy phiếu hay tự kết luận xử phạt.
- Người ngoài mạng lưới chỉ thấy phiếu có tên mình.

### Cảnh báo đỏ

- Vấn đề mức **Nguy hiểm**.
- Vấn đề **quá hạn xử lý** (không tính phiếu đang chờ KSNK xác nhận).
- **Báo cáo tháng** chưa xác nhận sau ngày hạn (mặc định ngày 5 tháng sau, đổi ở mục Quản lý). Thành viên thấy nhắc báo cáo của mình; KSNK thấy số người chưa xác nhận.

### Cách tính số liệu

- Bộ lọc: Tháng này / Quý này / 6 tháng / Năm nay / Chọn ngày.
- **Làm đúng** = số lần làm đúng / số lần quan sát, tính riêng từng nội dung; không có quan sát thì hiện `—`.
- **Vấn đề (% trên tổng)** = số vấn đề của nội dung / tổng vấn đề trong kỳ.
- **Đã xử lý xong (% số vấn đề)** = số phiếu Hoàn thành / số vấn đề ghi nhận trong kỳ, theo trạng thái hiện tại.

### Lưu ý

- Thông báo hiện là thông báo trong app demo, chưa phải push notification MyHV.
- Tiêu chí mức độ, thời hạn xử lý và quy tắc xử phạt là **giá trị minh họa**, cần bệnh viện phê duyệt. Vấn đề Nguy hiểm vẫn phải báo trực tiếp ngay, không chờ thao tác trong app.
- Thêm thành viên trong demo không tự cấp quyền MyHV; người dùng không thể tự ngừng tham gia của chính mình.

### Tài khoản mẫu

| Vai trò | Mã nhân viên | Ghi chú |
|---|---|---|
| Thành viên mạng lưới | `DEMO-BS-001` | Bác sĩ mạng lưới – khoa mô phỏng |
| Nhân viên y tế | `DEMO-NV-001` | Chỉ xem và phản hồi phiếu có tên mình |
| Khoa KSNK | `DEMO-KSNK-001` | Tiếp nhận, xác nhận kết quả, quản lý |

Dữ liệu nhân sự và khoa đều giả lập, mã có tiền tố `DEMO-`. Không dùng tài khoản hay danh mục nội bộ bệnh viện.

## 3. Phần đã gỡ khỏi giao diện

Các màn hình của luồng cũ (đăng nhập, chọn phân hệ, Sổ giám sát, Giám sát trong ngày, BM-BS01/BC-BS04, bảng theo dõi bác sĩ, ca nghi ngờ/HĐKH, đánh giá KPI) **không còn trong giao diện** để tránh rối cho người mới. API cũ (`/api/auth/login`, `/api/doctor`, `/api/surveillance`, …) vẫn được giữ ở backend để tương thích; giao diện mới dùng phiên mẫu/xác thực phiên, `/api/module` cùng các API phiếu, báo cáo, thành viên, khoa và lịch sử hiện có.
## 4. Căn cứ nghiệp vụ

Demo được tổ chức theo hai tài liệu người dùng cung cấp:

1. **Dự thảo Quy chế Bệnh viện Đa khoa Hùng Vương**, Điều 106 – Quy chế kiểm soát nhiễm khuẩn bệnh viện: cơ cấu mạng lưới tại khoa, vai trò thành viên, vai trò Khoa KSNK và bộ phận giám sát.
2. **Quyết định 5052/2026/QĐ-BVHV ngày 12/11/2026**, ban hành Quy chế hoạt động của Mạng lưới KSNK: trách nhiệm từng cấp, các lĩnh vực giám sát, báo cáo hằng tháng, họp 3 tháng/lần, lưu trữ hồ sơ, đánh giá 6 tháng và hằng năm.

Các nội dung như số lượt giám sát/ngày, thời hạn khắc phục cụ thể, điểm KPI hoặc biểu mẫu chi tiết chưa được hai tài liệu ấn định thì để ở dạng cấu hình/tham khảo demo, không coi là quy định chính thức. Nội dung chuyên môn phải được Khoa KSNK-PCBT xác nhận trước khi đưa vào vận hành.

## 5. Dữ liệu nhân sự, khoa/phòng và xác thực

- Dữ liệu demo vẫn nằm trong `server/data/seed.json`, dùng hồ sơ giả và mã nhân viên có tiền tố `DEMO-`; không chứa thông tin đăng nhập hoặc nhân sự thật.
- `server/data/departments.json` chứa danh mục mã/tên khoa mô phỏng. Chức năng thêm thành viên dùng danh mục này thay vì gõ mã/tên khoa tự do. Không đưa danh mục hoặc nhân sự nội bộ từ DB vào bộ dữ liệu công khai.
- Backend chuẩn hóa hồ sơ xác thực sang các trường ứng dụng `employeeCode`, `fullName`, `position`, `departmentCode`, `departmentName`. Server tham chiếu cung cấp tương ứng `Manv`, `Tennv`, `Tencv`, `Makhoa`, `Tenkhoa`; phạm vi khoa luôn lấy từ hồ sơ vừa xác thực, không lấy từ file gán quyền.
- Giao diện không có màn hình đăng nhập; bản demo dùng phiên mẫu ở mục 2. Adapter tham khảo `employee-cookie-api` chưa được kết nối vào luồng xác thực; đặt `AUTH_MODE=external` không kích hoạt xác thực bệnh viện. Không nhập tài khoản HIS thật vào bản demo.
- `server/data/role-assignments.json` chỉ là mẫu ánh xạ vai trò, chưa được dùng trong đăng nhập demo. Các khóa `REPLACE_WITH_...` là chỗ giữ mẫu; trước khi tích hợp thật cần xác nhận quy trình phân quyền theo quyết định bệnh viện. Chức vụ nhân sự không tự cấp quyền mạng lưới.
- Không lưu mật khẩu HIS, không log request body đăng nhập và không đặt chuỗi kết nối DB/tài khoản DB ở frontend. Dữ liệu JSON vẫn chỉ phù hợp demo một backend instance; triển khai chính thức cần đánh giá cơ chế lưu tập trung, quản lý token, HTTPS, backup/restore và phân quyền với CNTT bệnh viện.

Bản công khai không kết nối hệ thống bệnh viện.

## 6. Lưu trữ và giới hạn

JSON file chỉ dùng cho demo nội bộ nhỏ, một backend instance. Server giữ bản dữ liệu trong bộ nhớ, ghi file tạm rồi rename (có thử lại khi Windows khóa file) để tránh ghi dở; chưa phải hệ quản trị dữ liệu chính thức, chưa có cơ chế đồng bộ đa máy chủ, phân cụm, backup tự động hoặc kiểm soát phiên bản chuyên nghiệp. Trước khi chạy thật cần thay storage bằng giải pháp tập trung được bệnh viện phê duyệt, bổ sung HTTPS, SSO, chính sách phân quyền, backup/restore, audit, kiểm thử tải và đánh giá an toàn thông tin.

Không nhập dữ liệu người bệnh định danh hoặc dữ liệu nhạy cảm thật vào bản demo.

Các quy trình B1–B6, xác minh ca bệnh, tích hợp HIS và các tiêu chuẩn chẩn đoán chưa được triển khai đầy đủ trong phạm vi demo bác sĩ này. Phiếu và bảng kiểm cần KSNK-PCBT phê duyệt trước khi áp dụng; các phần hình, đối tượng nhúng trong tài liệu nguồn chưa được đối chiếu đầy đủ.

Kiểm thử API và adapter bằng dữ liệu cách ly: chạy `npm test` trong thư mục `server`. Các ca module bao gồm mẫu số/tổng hợp, phân quyền, lưu thông báo, phản hồi và biên hết tháng theo múi giờ Việt Nam.

### Cập nhật bản dùng thử trực tuyến (dành cho người phát triển)

- Chạy `npm run test:pages`, sau đó `npm run build:pages`.
- Chép các file trong `client/dist/ksnk-pages/browser` vào thư mục gốc, xóa bộ file `main-*.js`, `polyfills-*.js`, `styles-*.css` cũ, giữ `.nojekyll`. Commit và push lên `main`; vài phút sau link trực tuyến tự cập nhật.
- Bản trực tuyến chạy toàn bộ nghiệp vụ ngay trong trình duyệt, lưu dữ liệu bằng localStorage, không gọi máy chủ nào.

## 7. Cấu trúc

```text
ksnk-network-demo/
  client/                 Angular standalone application
  server/                 Express API + JSON demo storage
    data/seed.json        dữ liệu mẫu
    data/departments.json danh mục khoa mô phỏng
    data/role-assignments.json
    .env.example
  README.md
```
