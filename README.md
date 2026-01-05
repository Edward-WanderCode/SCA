# SCA - Security Code Analysis Platform

**Phần mềm phân tích mã nguồn và bảo mật toàn diện với giao diện hiện đại.**

SCA (Security Code Analysis) là nền tảng quản lý quét bảo mật mã nguồn tĩnh (Static Application Security Testing - SAST), được xây dựng trên công nghệ **Next.js 16** mới nhất và tích hợp công cụ quét mạnh mẽ **OpenGrep**. Dự án cung cấp giao diện trực quan, báo cáo chi tiết và khả năng quản lý quy trình quét bảo mật hiệu quả.

---

## 🚀 Tính Năng Chính

*   **⚡ Web-based Dashboard Cao Cấp**: Giao diện người dùng hiện đại, hỗ trợ Dark Mode, Glassmorphism và điều hướng mượt mà.
*   **🔍 OpenGrep Integration (SAST)**: Phân tích mã nguồn tĩnh (Static Analysis) giúp phát hiện lỗi logic và lỗ hổng bảo mật trong code (Python, Java, JS/TS, Go, C#...).
*   **📦 Trivy Integration (SCA)**: Quét các thư viện phụ thuộc (Dependencies), phát hiện các lỗ hổng đã biết (CVE) và tìm kiếm Secret/API Key bị lộ.
*   **📊 Báo Cáo & Trực Quan Hóa**:
    *   Biểu đồ thống kê lỗ hổng theo mức độ nghiêm trọng.
    *   Xuất báo cáo **PDF** chuyên nghiệp cho các đợt kiểm toán (Audit).
*   **📱 Telegram Integration**: 
    *   Tự động gửi báo cáo PDF lên Telegram sau khi scan hoàn thành.
    *   **[MỚI]** Trigger scans từ Telegram bot commands (`/scan`, `/status`, `/help`).
*   **🖥️ Real-time Terminal**: Theo dõi tiến trình quét và log chi tiết trực tiếp trên trình duyệt.
*   **🛡️ Quản Lý Rules**: Tải xuống và cập nhật các bộ luật bảo mật (Security Rules) từ cộng đồng và các tổ chức uy tín (OWASP, v.v.).
*   **🔐 Authentication**: Tích hợp sẵn hệ thống xác thực người dùng (NextAuth.js).


---

## 🛠️ Tech Stack

Dự án sử dụng các công nghệ tiên tiến nhất hiện nay:

*   **Frontend**: [Next.js 16](https://nextjs.org/) (App Router), [React 19](https://react.dev/), [Tailwind CSS 4](https://tailwindcss.com/)
*   **UI Components**: Lucide React, Framer Motion (Animations), Recharts (Biểu đồ)
*   **Backend / API**: Next.js Server Actions & API Routes
*   **Database**: Prisma ORM (kết nối SQLite/PostgreSQL)
*   **Core Engine**: [OpenGrep](https://github.com/opengrep/opengrep) (Static Analysis)
*   **Utilities**: jspdf (Xuất PDF), Zod (Validation), Date-fns

---

## 🚦 Cài Đặt & Sử Dụng

### 1. Yêu Cầu Hệ Thống
*   Node.js 18+ (Khuyên dùng bản mới nhất)
*   Git
*   **OpenGrep & Trivy**: Cần có các file thực thi (binary) để quét.
    *   `OpenGrep/opengrep.exe` (cho SAST)
    *   `Trivy/trivy.exe` (cho SCA & Secrets)

### 2. ⚙️ Thiết Lập Engine Quét (OpenGrep & Trivy)

Để hệ thống hoạt động offline, bạn cần tải về các binary của OpenGrep và Trivy. Dự án đã tích hợp sẵn script tự động:

```bash
npm run setup
```
Script này sẽ:
1.  Tự động tải `opengrep.exe` và `trivy.exe` mới nhất.
2.  Cài đặt vào thư mục `OpenGrep/` và `Trivy/` trong project.

*Lưu ý: Nếu script gặp lỗi mạng, bạn có thể thực hiện thủ công như sau:*

**Manual Setup (Fallback)**
*   **OpenGrep**: Tải `opengrep.exe` (Windows x64) từ [GitHub Releases](https://github.com/opengrep/opengrep/releases) -> bỏ vào thư mục `OpenGrep/`.
*   **Trivy**: Tải `trivy_windows-64bit.zip` từ [GitHub Releases](https://github.com/aquasecurity/trivy/releases) -> giải nén lấy `trivy.exe` -> bỏ vào thư mục `Trivy/`.

### 🔄 Cập Nhật Rules & Database (Offline Mode)
Để chuẩn bị dữ liệu quét cho môi trường offline, hãy chạy lệnh sau (khi có mạng):

```bash
npm run update-rules
```
Lệnh này sẽ:
1.  Tải rules mới nhất từ `opengrep/opengrep-rules` về thư mục `OpenGrep/rules`.
2.  Tải Trivy Vulnerability DB về thư mục `Trivy/cache`.

Khi quét, hệ thống sẽ tự động sử dụng rules và DB đã tải về mà không cần kết nối mạng.

---

### 3. Cài Đặt Dependencies

```bash
npm install
```

### 4. Khởi Chạy Môi Trường Cục Bộ (Development)

```bash
npm run dev
```
Truy cập ứng dụng tại: `http://localhost:3000`

### 5. Build Production

```bash
npm run build
npm run start
```

---

## 📂 Cấu Trúc Dự Án

```
e:\Code\SCA\
├── src\
│   ├── app\             # Next.js App Router (Pages & API)
│   │   ├── history\     # Lịch sử quét
│   │   ├── scan\        # Chức năng quét mới
│   │   ├── terminal\    # Giao diện Terminal
│   │   ├── rules\       # Quản lý Rules
│   ├── components\      # UI Components tái sử dụng
│   ├── lib\             # Tiện ích (Scanner wrapper, PDF export...)
├── OpenGrep\            # Chứa binary OpenGrep và config
├── public\              # Static assets
└── ...
```

## 📝 Available Scripts

*   `npm run dev`: Chạy server phát triển.
*   `npm run build`: Build ứng dụng cho môi trường production.
*   `npm run start`: Chạy server production.
*   `npm run setup`: Tự động tải và cài đặt OpenGrep & Trivy binaries.
*   `npm run update-rules`: Cập nhật Rules và Database cho chế độ Offline.
*   `npm run lint`: Kiểm tra lỗi code với ESLint.
*   `npm run scan-local`: Chạy thử nghiệm OpenGrep quét thư mục hiện tại qua CLI.

---

## 📱 Telegram Integration

SCA Platform hỗ trợ tích hợp Telegram với 2 tính năng chính:

### 1. 🔔 Nhận Thông Báo Tự Động
- Nhận báo cáo PDF sau khi scan hoàn thành
- Thống kê findings và severity levels
- Tổ chức báo cáo theo topics (cho forum groups)

### 2. 🤖 Gửi Lệnh Scan từ Bot (MỚI!)
Bây giờ bạn có thể **trigger scans từ Telegram** mà không cần mở web:
- `/scan <repo-url>` - Bắt đầu quét một Git repository
- `/status <scan-id>` - Kiểm tra trạng thái scan
- `/help` - Xem hướng dẫn

**2 Chế Độ Hoạt Động:**

#### 🌐 Webhook Mode (Cho servers công khai)
- Telegram gọi trực tiếp đến server
- Yêu cầu HTTPS và accessible từ internet
- Response time nhanh (instant)
- Xem: [TELEGRAM_SETUP.md](./TELEGRAM_SETUP.md)

#### 🔒 Polling Mode (Cho private networks) ⭐ **RECOMMENDED cho Tailscale**
- Bot tự poll Telegram API
- **KHÔNG CẦN expose ra internet**
- Hoàn hảo cho Tailscale/VPN
- An toàn hơn, dễ setup hơn
- Xem: [TELEGRAM_POLLING_GUIDE.md](./TELEGRAM_POLLING_GUIDE.md)

**Quick Start (Polling Mode):**
```bash
# Setup bot token trong Settings, sau đó:
node scripts/start-telegram-polling.js
```

**Lợi ích:**
- ✨ Scan từ bất kỳ đâu (mobile, desktop)
- ⚡ Không cần mở web interface
- 📊 Nhận kết quả ngay trên Telegram
- 👥 Team collaboration trong group chats
- 🔒 **An toàn cho private networks**

---

## �🛡️ License

Private / Internal Project.
Built with ❤️ by **Antigravity**.
