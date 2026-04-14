# Chính sách bảo mật

🇬🇧 [English version](SECURITY.md)

## Phiên bản được hỗ trợ

| Phiên bản | Hỗ trợ             |
|-----------|---------------------|
| 0.1.x     | ✅ Đang hỗ trợ     |

## Báo cáo lỗ hổng bảo mật

Nếu bạn phát hiện lỗ hổng bảo mật trong SCA, vui lòng **KHÔNG** tạo Issue công khai.

### Cách báo cáo

1. **Email**: Gửi chi tiết đến maintainer qua GitHub profile
2. **GitHub Security Advisory**: Sử dụng tab "Security" trên repository để tạo private advisory

### Thông tin cần cung cấp

- Mô tả lỗ hổng
- Các bước tái hiện
- Mức độ nghiêm trọng (Critical / High / Medium / Low)
- Phiên bản bị ảnh hưởng
- Giải pháp đề xuất (nếu có)

### Thời gian phản hồi

- **Xác nhận nhận được**: trong 48 giờ
- **Đánh giá ban đầu**: trong 7 ngày
- **Bản vá**: tùy thuộc mức độ nghiêm trọng

## Các biện pháp bảo mật hiện tại

- Input sanitization cho tất cả API endpoints
- Command injection prevention khi gọi scan engines
- SQLite WAL mode để tránh database lock
- Temporary file cleanup tự động
- Environment variables cho sensitive configuration
