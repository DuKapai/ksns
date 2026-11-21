# KSNK Network – Demo quản lý Mạng lưới Kiểm soát nhiễm khuẩn

Ứng dụng demo Angular + Node.js, chưa yêu cầu SQL/database và chưa kết nối HIS.

## Demo trực tuyến

Mở [KSNK Network trên GitHub Pages](https://dukapai.github.io/ksns/). Chọn **Bác sĩ mạng lưới** hoặc **Khoa KSNK-PCBT**, rồi chọn tài khoản demo để tự điền tài khoản và mật khẩu trước khi bấm đăng nhập. Các tài khoản điều dưỡng, trưởng khoa và thư ký vẫn có trong **Tài khoản demo khác**.

Bản web chạy hoàn toàn trong trình duyệt, không kết nối máy chủ hay dữ liệu bệnh viện. Dữ liệu mỗi trình duyệt lưu riêng, không đồng bộ giữa người dùng hoặc thiết bị; xóa dữ liệu trang web hoặc dùng chế độ riêng tư có thể làm mất dữ liệu. Để bắt đầu lại, xóa dữ liệu trang web `dukapai.github.io` trong cài đặt trình duyệt (việc này cũng có thể xóa dữ liệu các trang khác cùng tên miền). Không nhập dữ liệu người bệnh hoặc tài khoản thật. Vai trò và đăng nhập chỉ mô phỏng trong trình duyệt, không cung cấp bảo mật cho triển khai thực tế.

Để dựng lại bản Pages, cài dependencies rồi chạy `npm run build:pages` trong `client`; xuất nội dung `client/dist/ksnk-demo/browser` vào thư mục gốc của nhánh `main` đang được GitHub Pages sử dụng, cùng file `.nojekyll`. Đường dẫn gốc `/ksns/` được cấu hình cho repository này. Chạy `node --test pages-demo/browser-api.test.mjs` trong `client` sau khi build để kiểm tra adapter. Bản này tái sử dụng nghiệp vụ server qua adapter trình duyệt; đây không phải API bảo mật.

## 1. Chạy thử nhanh

Yêu cầu: Node.js 20.19+ (khuyến nghị Node 22 LTS) và npm.

```bash
# tại thư mục gốc
npm install
npm run install:all
npm run dev
```

Mở `http://localhost:4200`. API chạy tại `http://localhost:3000`.

Trên Windows có thể chạy `setup.bat` một lần, sau đó chạy `run-demo.bat`.

Nếu chạy lần đầu, backend tự tạo `server/data/demo-store.json` từ `server/data/seed.json`.

## 2. Tài khoản demo

Mật khẩu demo chung: `Demo@123`

| Phân hệ | Tài khoản | Vai trò |
|---|---|---|
| Thành viên mạng lưới | `bs.nguyen` | Bác sĩ mạng lưới – Khoa A (mô phỏng) |
| Thành viên mạng lưới | `dd.tran` | Điều dưỡng mạng lưới – Khoa A (mô phỏng) |
| Trưởng khoa | `truongkhoa.noi` | Trưởng khoa – Khoa A (mô phỏng) |
| Khoa KSNK-PCBT | `ksnk.admin` | Quản trị chuyên môn KSNK |
| Thư ký mạng lưới | `thuky.ksnk` | Thư ký mạng lưới |

Dữ liệu nhân sự và khoa/phòng trong bản công khai đều là giả lập, không đại diện cho nhân viên hoặc danh mục bệnh viện thật.

**Bắt đầu:** chọn một trong hai vai trò chính ở trang đầu. Bác sĩ có ba việc: **Giám sát trong ngày**, **Báo nguy cơ**, **Gửi báo cáo tháng**; KSNK có **Theo dõi các khoa**, **Kiểm tra nguy cơ**, **Theo dõi bác sĩ**. Chức năng bổ sung nằm ở **Xem chức năng khác**. Phần mềm không tự gửi cảnh báo; tình huống khẩn cấp phải báo trực tiếp.

## 3. Các luồng nghiệp vụ đã có

- Menu **Lịch & báo cáo** tập trung lịch đề xuất, BM-BS01 (giám sát chuyên môn và sổ theo dõi), BC-BS04 (báo cáo tháng tự tổng hợp) và bảng theo dõi của KSNK. Phiếu nguy cơ và quá trình khắc phục được ghi trong menu **Báo nguy cơ**; phiếu quan sát vệ sinh tay, PPE và chất thải nằm ở **Phiếu giám sát**. Bản demo không đồng bộ dữ liệu với Google Form.
- Menu **Giám sát trong ngày** phân vai: bác sĩ mạng lưới gửi/tổng hợp số liệu ngày và bốn nhóm VAP, CAUTI, SSI, CLABSI; điều dưỡng mạng lưới tiếp tục ghi phiếu vệ sinh tay hiện có. Số ca được tính từ các phiếu đã ghi, không có nghĩa là đã xác nhận không có ca chưa phát hiện. KSNK theo dõi khoa chưa nhập sau hạn demo và có thể lọc/xuất danh sách ca nghi ngờ trong tuần để ghi nhận trình HĐKH.
- Phiếu bệnh truyền nhiễm/cách ly ghi thời điểm, vị trí, dấu hiệu/lý do nghi ngờ, biện pháp ban đầu, tình trạng và hình thức cách ly, nơi/giờ đã thông báo. KSNK ghi mã chuyển HĐKH và nhập kết luận do Hội đồng cung cấp; hệ thống không tự chẩn đoán hoặc xác nhận ca.
- Chỉ số gói là số đối tượng tuân thủ đầy đủ gói / đối tượng đủ điều kiện được rà soát; mẫu số từng gói tách biệt. Thành phần gói, định nghĩa ca, phương pháp chọn mẫu và xử lý 0/0 cần KSNK/HĐKH phê duyệt. Vệ sinh tay tính số cơ hội đạt / tổng cơ hội theo các phiếu điều dưỡng; không có cơ hội thì hiển thị chưa có mẫu số.
- Nhắc thiếu báo cáo là cảnh báo trong ứng dụng khi xem ngày; mốc 16:00 và phạm vi yêu cầu nhập ngày đều là cấu hình demo, chưa tự gửi SMS/email và cần bệnh viện chốt trước khi áp dụng.
- Các mốc 15 phút/ngày, 30 phút/lượt tuần, 4 lượt tuần/tháng và ngày 5 của tháng sau là **chỉ tiêu minh họa có thể điều chỉnh**, chưa được phê duyệt và không phải yêu cầu pháp luật. Không tự kết luận đạt nhiệm vụ chỉ từ số phiếu; KSNK cần kiểm tra nội dung, minh chứng và kết quả khắc phục.
- Tại bảng theo dõi, KSNK có thể lưu đánh giá có minh chứng và kiểm tra lại: điều kiện demo gồm đủ lượt tuần theo cấu hình, đã gửi báo cáo, có minh chứng, đã theo dõi nguy cơ/không phát sinh và đã kiểm tra lại. Kết quả là ảnh chụp lúc đánh giá; cần đánh giá lại khi số liệu hoặc cấu hình thay đổi. Lịch sử đánh giá được lưu trong dữ liệu demo.
- BM-BS01 phân biệt đạt, chưa đạt, không áp dụng và không đánh giá được; hai loại cuối không tính vào mẫu số. Báo cáo bác sĩ là bản chụp số liệu tại thời điểm gửi, không phải tỷ lệ nhiễm khuẩn bệnh viện hay chẩn đoán.
- Số nguy cơ trong báo cáo bác sĩ được tính theo tháng tạo phiếu tại múi giờ Việt Nam; trạng thái mở/đóng là trạng thái khi tổng hợp, không phải số vấn đề được đóng trong tháng.
- Nguy cơ cao phải báo **ngay bằng kênh trực tiếp** cho lãnh đạo khoa, KSNK-PCBT và cấp có thẩm quyền; việc nhập phiếu không gửi thông báo, không thay thế xử trí chuyên môn.
- Trang chủ ưu tiên hai vai trò bác sĩ và KSNK; các phân hệ khác vẫn có ở mục tài khoản nâng cao.
- Đăng nhập; chế độ Node kiểm tra vai trò tại backend, còn bản Pages chỉ mô phỏng kiểm tra tại trình duyệt. Chọn phân hệ không tự cấp quyền.
- Thành viên: xem nhiệm vụ, tạo phiếu giám sát, báo cáo nguy cơ/sự cố, xem tình trạng khắc phục, lập báo cáo tháng.
- Trưởng khoa: xem hoạt động của khoa, tiếp nhận nguy cơ, giao/ghi nhận khắc phục và gửi xác nhận hoàn thành.
- KSNK-PCBT: xem tổng quan toàn viện, quản lý thành viên, theo dõi nguy cơ, kiểm tra lại/đóng vấn đề, xem báo cáo và xuất CSV.
- Vòng đời nguy cơ: Mới ghi nhận → Đã tiếp nhận → Đang khắc phục → Chờ kiểm tra lại → Đã đóng. Nguy cơ cao được gắn cảnh báo cần báo ngay.
- Nhật ký thao tác cơ bản lưu cùng dữ liệu demo (trong trình duyệt ở bản Pages, hoặc trong backend khi chạy Node).

## 4. Căn cứ nghiệp vụ

Demo được tổ chức theo hai tài liệu người dùng cung cấp:

1. **Dự thảo Quy chế Bệnh viện Đa khoa Hùng Vương**, Điều 106 – Quy chế kiểm soát nhiễm khuẩn bệnh viện: cơ cấu mạng lưới tại khoa, vai trò thành viên, vai trò Khoa KSNK và bộ phận giám sát.
2. **Quyết định 5052/2026/QĐ-BVHV ngày 12/11/2026**, ban hành Quy chế hoạt động của Mạng lưới KSNK: trách nhiệm từng cấp, các lĩnh vực giám sát, báo cáo hằng tháng, họp 3 tháng/lần, lưu trữ hồ sơ, đánh giá 6 tháng và hằng năm.

Các nội dung như số lượt giám sát/ngày, thời hạn khắc phục cụ thể, điểm KPI hoặc biểu mẫu chi tiết chưa được hai tài liệu ấn định thì để ở dạng cấu hình/tham khảo demo, không coi là quy định chính thức. Nội dung chuyên môn phải được Khoa KSNK-PCBT xác nhận trước khi đưa vào vận hành.

## 5. Dữ liệu nhân sự, khoa/phòng và xác thực

- Dữ liệu demo vẫn nằm trong `server/data/seed.json`, dùng hồ sơ giả và mã nhân viên có tiền tố `DEMO-`; không chứa thông tin đăng nhập hoặc nhân sự thật.
- `server/data/departments.json` là danh mục khoa/phòng giả lập. Chức năng thêm thành viên dùng danh mục này thay vì gõ mã/tên khoa tự do; dữ liệu bệnh viện thật không được đưa vào bản công khai.
- Backend chuẩn hóa hồ sơ xác thực sang các trường ứng dụng `employeeCode`, `fullName`, `position`, `departmentCode`, `departmentName`. Server tham chiếu cung cấp tương ứng `Manv`, `Tennv`, `Tencv`, `Makhoa`, `Tenkhoa`; phạm vi khoa luôn lấy từ hồ sơ vừa xác thực, không lấy từ file gán quyền.
- Đăng nhập chỉ dùng tài khoản demo ghi ở mục 2. Adapter tham khảo `employee-cookie-api` chưa được kết nối vào luồng đăng nhập; đặt `AUTH_MODE=external` không kích hoạt xác thực bệnh viện. Không nhập tài khoản HIS thật vào bản demo.
- `server/data/role-assignments.json` chỉ là mẫu ánh xạ vai trò, chưa được dùng trong đăng nhập demo. Các khóa `REPLACE_WITH_...` là chỗ giữ mẫu; trước khi tích hợp thật cần xác nhận quy trình phân quyền theo quyết định bệnh viện. Chức vụ nhân sự không tự cấp quyền mạng lưới.
- Không lưu mật khẩu HIS, không log request body đăng nhập và không đặt chuỗi kết nối DB/tài khoản DB ở frontend. Dữ liệu JSON vẫn chỉ phù hợp demo một backend instance; triển khai chính thức cần đánh giá cơ chế lưu tập trung, quản lý token, HTTPS, backup/restore và phân quyền với CNTT bệnh viện.

Chi tiết endpoint/mapping và các giới hạn xem `HIS-INTEGRATION.md`. Bản công khai chưa tích hợp đăng nhập nhân viên thật và không chứa dữ liệu nhân sự hoặc danh mục khoa/phòng thật.

## 6. Lưu trữ và giới hạn

JSON file chỉ dùng cho demo nội bộ nhỏ, một backend instance. Có ghi file tạm rồi rename để tránh ghi dở; chưa phải hệ quản trị dữ liệu chính thức, chưa có cơ chế đồng bộ đa máy chủ, phân cụm, backup tự động hoặc kiểm soát phiên bản chuyên nghiệp. Trước khi chạy thật cần thay storage bằng giải pháp tập trung được bệnh viện phê duyệt, bổ sung HTTPS, SSO, chính sách phân quyền, backup/restore, audit, kiểm thử tải và đánh giá an toàn thông tin.

Không nhập dữ liệu người bệnh định danh hoặc dữ liệu nhạy cảm thật vào bản demo.

Các quy trình B1–B6, xác minh ca bệnh, tích hợp HIS và các tiêu chuẩn chẩn đoán chưa được triển khai đầy đủ trong phạm vi demo bác sĩ này. Phiếu và bảng kiểm cần KSNK-PCBT phê duyệt trước khi áp dụng; các phần hình, đối tượng nhúng trong tài liệu nguồn chưa được đối chiếu đầy đủ.

Kiểm thử API và adapter bằng dữ liệu cách ly: chạy `npm test` trong thư mục `server`.

## 7. Cấu trúc

```text
ksnk-network-demo/
  client/                 Angular standalone application
  server/                 Express API + JSON demo storage
    data/seed.json        dữ liệu mẫu
    data/departments.json danh mục khoa/phòng mô phỏng
    data/role-assignments.json
    .env.example
  README.md
```
