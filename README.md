# KSNK – Module Mạng lưới Kiểm soát nhiễm khuẩn (bản dùng thử)

**Dùng thử ngay:** https://DuKapai.github.io/ksns/

Mở link là dùng được, không cần đăng nhập hay cài đặt. Cuối trang có 3 nút để đổi vai trò:

| Vai trò | Làm gì |
|---|---|
| **Nhân viên mạng lưới** | Ghi nhận giám sát, ghi nhận vấn đề, xác nhận báo cáo tháng |
| **Bác sĩ** | Nhận thông báo và phản hồi phiếu có tên mình (đến hết tháng lập phiếu) |
| **Khoa KSNK** | Tiếp nhận phiếu, xác nhận kết quả xử lý, quản lý thành viên |

Một phiếu vấn đề đi theo 3 bước: **Tiếp nhận → Báo đã xử lý → Xác nhận kết quả**. Phiếu nguy hiểm hoặc quá hạn được báo đỏ. Báo cáo tháng tự tổng hợp từ các phiếu đã ghi, chỉ cần bấm xác nhận.

Dữ liệu trên bản dùng thử là dữ liệu giả, lưu riêng trên trình duyệt của mỗi người. Không nhập thông tin người bệnh thật.

## Chạy trên máy

Cần Node.js 20 trở lên.

```bash
npm install
npm run install:all
npm run dev
```

Mở `http://localhost:4200`. Dữ liệu lưu ở `server/data/demo-store.json`; xóa file này (sau khi tắt server) để làm lại từ đầu.

## Cập nhật bản dùng thử trực tuyến

```bash
npm run test:pages
npm run build:pages
```

Chép các file trong `client/dist/ksnk-pages/browser` ra thư mục gốc (xóa bộ `main-*.js`, `polyfills-*.js`, `styles-*.css` cũ), rồi commit và push lên `main`. Vài phút sau link tự cập nhật.

## Kiểm thử

```bash
cd server && npm test
```

## Cấu trúc

```text
client/   giao diện Angular (một màn hình duy nhất: client/src/app/pages/module.component.*)
server/   API Node.js + dữ liệu JSON (dữ liệu mẫu: server/data/seed.json)
```

## Lưu ý

- Bản này chưa nối MyHV: chưa có đăng nhập thật, chưa có thông báo đẩy về điện thoại.
- Mức độ, thời hạn xử lý và quy tắc xử phạt chỉ là giá trị minh họa, cần Khoa KSNK phê duyệt trước khi dùng thật.
- Lưu bằng file JSON chỉ phù hợp dùng thử; triển khai thật cần CNTT bệnh viện đánh giá lưu trữ, phân quyền và bảo mật.
