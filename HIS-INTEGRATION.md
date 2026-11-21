# Tích hợp xác thực và hồ sơ nhân viên bệnh viện

## Hợp đồng server tham chiếu đã kiểm tra

Server tham chiếu kết nối SQL Server ở backend, xác thực tài khoản theo mã nhân viên và trả hồ sơ sau khi đăng nhập:

- `POST /api/login`, body `{ "manv": "...", "password": "..." }`.
- Phản hồi thành công trực tiếp gồm `manv`, `tennv`, `makhoa`, `tenkhoa`, `macv`, `tencv` và một số trường hồ sơ khác. API đồng thời đặt cookie phiên `HttpOnly`.
- `GET /api/department/departments` trả `{ "departments": [{ "makhoa": "...", "tenkhoa": "..." }] }`; route cần phiên nhân viên.
- Các trường hồ sơ được đọc từ `NHANVIEN`, nối với `KHOA` và `CHUCVU`; danh sách khoa lấy từ `KHOA`.

API danh mục khoa cần đăng nhập. Danh mục trong bản công khai là dữ liệu mô phỏng, không chứa danh mục lấy từ bệnh viện.

## Adapter tham khảo cho API tham chiếu

Adapter chưa được nối vào luồng đăng nhập và không thể kích hoạt bằng cấu hình. Các trường sau chỉ mô tả hợp đồng cần tích hợp và kiểm thử sau khi CNTT phê duyệt:

```env
AUTH_MODE=external
HIS_AUTH_PROTOCOL=employee-cookie-api
HIS_API_BASE_URL=https://host-api-do-benh-vien-phe-duyet
HIS_AUTH_PATH=/api/login
HIS_AUTH_USERNAME_FIELD=manv
HIS_AUTH_PASSWORD_FIELD=password
HIS_API_TIMEOUT_MS=10000
```

Mặc định mapping phản hồi tương ứng:

| Hồ sơ API tham chiếu | Hồ sơ nội bộ ứng dụng |
|---|---|
| `manv` | `employeeCode` |
| `tennv` | `fullName` |
| `tencv` | `position` |
| `makhoa` | `departmentCode` |
| `tenkhoa` | `departmentName` |

Đăng nhập hiện chỉ dùng tài khoản demo. Không nhập tài khoản bệnh viện vào bản này; trước khi kết nối thật cần thống nhất endpoint, HTTPS, quản lý phiên, thu hồi quyền và quy trình vận hành với CNTT bệnh viện.

## Gán vai trò

Adapter tham khảo tra `employeeCode`/`Manv` trong `server/data/role-assignments.json`, nhưng luồng đăng nhập demo không sử dụng file này. Các khóa `REPLACE_WITH_...` hiện là chỗ giữ mẫu; trước khi tích hợp thật cần xác nhận quy trình phân quyền theo quyết định của bệnh viện.

```json
{
  "MA_NHAN_VIEN_DA_DUYET": {
    "roles": ["MEMBER_DOCTOR"]
  }
}
```

Vai trò được hỗ trợ: `MEMBER_DOCTOR`, `MEMBER_NURSE`, `DEPARTMENT_HEAD`, `KSNK_ADMIN`, `NETWORK_LEAD`, `NETWORK_DEPUTY`, `NETWORK_SECRETARY`. Có thể gán nhiều vai trò. Chức vụ `Macv`/`Tencv` không tự cấp quyền mạng lưới; mã và tên khoa luôn lấy từ hồ sơ API đã xác thực để tránh gán nhầm phạm vi khoa.

## API token-profile khác

Adapter tham khảo còn có giao thức `token-profile`, gồm endpoint đăng nhập trả token JSON và endpoint profile chấp nhận token. Cần tích hợp và kiểm thử riêng trước khi sử dụng; đây không phải hợp đồng của server tham chiếu SQL/cookie nêu trên.

## Danh mục khoa/phòng

`server/data/departments.json` chứa mã và tên khoa mô phỏng. Endpoint nội bộ `GET /api/departments` yêu cầu bearer token và trả `{ "items": [...] }`, dùng làm danh mục chọn khoa khi quản lý mạng lưới.

Khi bệnh viện đổi cơ cấu hoặc dùng hệ thống khác, cập nhật snapshot từ API danh mục được cấp quyền rồi kiểm tra lại mã khoa trong dữ liệu thành viên/báo cáo. Không cần truy vấn bảng mật khẩu, không đồng bộ dữ liệu người bệnh và không đưa thông tin xác thực DB vào Angular.

## Giới hạn trước khi triển khai thật

- Chưa xác thực thành công tài khoản nhân viên thật; cần kiểm thử sau khi CNTT cấp môi trường tích hợp và tài khoản kiểm thử được phê duyệt.
- Token demo có chữ ký HMAC và thời hạn 8 giờ, không phải JWT chuẩn. Cần CNTT duyệt cách quản lý/thu hồi token, khóa ký và lưu trữ dữ liệu trước khi triển khai production.
- Backend vẫn lưu phiếu, giám sát, báo cáo, audit trong JSON cục bộ; không dùng cho nhiều instance hoặc hồ sơ chính thức.
- `departments.json` là dữ liệu giả lập, không tự đồng bộ realtime.
- Không tự truy vấn bảng mật khẩu HIS/SQL và không nhập dữ liệu người bệnh định danh vào demo.
