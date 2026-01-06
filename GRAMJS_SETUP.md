# Hướng dẫn cấu hình GramJS cho tải file lớn

Hệ thống đã được nâng cấp để hỗ trợ tải file **lớn hơn 20MB** (lên đến **2GB**) bằng cách sử dụng **GramJS** (MTProto protocol).

## Cấu hình

### Bước 1: Lấy API Credentials

1. Truy cập https://my.telegram.org
2. Đăng nhập bằng số điện thoại của bạn
3. Chọn "API development tools"
4. Tạo ứng dụng mới (tên gì cũng được)
5. Lưu lại `App api_id` và `App api_hash`

### Bước 2: Cập nhật file `.env.local`

Tạo file `.env.local` trong thư mục gốc của project với nội dung:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here

# GramJS Configuration (Required for files >20MB)
TELEGRAM_API_ID=your_api_id_here
TELEGRAM_API_HASH=your_api_hash_here

# Optional: Session string (will be printed in console on first run)
# TELEGRAM_SESSION=
```

### Bước 3: Khởi động lại server

```bash
npm run dev
```

## Cách hoạt động

- **File ≤ 20MB**: Tự động sử dụng Bot API (cách cũ)
- **File > 20MB**: Tự động chuyển sang GramJS (MTProto)

Bot sẽ hiển thị phương thức đang sử dụng khi bạn upload file:
- 🤖 **Sử dụng Bot API** - File nhỏ
- ⚡ **Sử dụng GramJS (file >20MB)** - File lớn

## Lưu ý

- Lần đầu tiên kết nối, hệ thống sẽ in ra một **session string** trong console. 
- Copy và lưu vào `.env.local` dưới tên `TELEGRAM_SESSION` để không phải kết nối lại mỗi khi restart.
- Nếu không cấu hình GramJS, file > 20MB sẽ báo lỗi.

## Giới hạn

| Phương thức | Giới hạn file |
|------------|---------------|
| Bot API | 20 MB |
| GramJS | 2 GB (4 GB với Telegram Premium) |

## Troubleshooting

### Lỗi "GramJS not configured"
- Kiểm tra xem đã thêm `TELEGRAM_API_ID` và `TELEGRAM_API_HASH` vào `.env.local` chưa
- Khởi động lại server sau khi thêm biến môi trường

### Lỗi kết nối
- Kiểm tra API ID và Hash có đúng không
- Đảm bảo máy có kết nối internet
