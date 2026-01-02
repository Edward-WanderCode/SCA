# SCA - Security Code Analysis Platform

**Phần mềm phân tích mã nguồn và bảo mật toàn diện với giao diện hiện đại.**

SCA (Security Code Analysis) là nền tảng quản lý quét bảo mật mã nguồn tĩnh (Static Application Security Testing - SAST), được xây dựng trên công nghệ **Next.js 16** mới nhất và tích hợp công cụ quét mạnh mẽ **OpenGrep**. Dự án cung cấp giao diện trực quan, báo cáo chi tiết và khả năng quản lý quy trình quét bảo mật hiệu quả.

---

## 🚀 Tính Năng Chính

*   **⚡ Web-based Dashboard Cao Cấp**: Giao diện người dùng hiện đại, hỗ trợ Dark Mode, Glassmorphism và điều hướng mượt mà.
*   **🔍 OpenGrep Integration**: Tích hợp sâu với OpenGrep (fork của Semgrep) cho tốc độ quét cực nhanh và hỗ trợ đa ngôn ngữ (Python, Java, JS/TS, Go, C#...).
*   **📊 Báo Cáo & Trực Quan Hóa**:
    *   Biểu đồ thống kê lỗ hổng theo mức độ nghiêm trọng.
    *   Xuất báo cáo **PDF** chuyên nghiệp cho các đợt kiểm toán (Audit).
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
*   Binary `opengrep.exe` (đã bao gồm trong thư mục `OpenGrep/`)

### 2. Cài Đặt Dependencies

```bash
npm install
```

### 3. Khởi Chạy Môi Trường Cục Bộ (Development)

```bash
npm run dev
```
Truy cập ứng dụng tại: `http://localhost:3000`

### 4. Build Production

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
*   `npm run lint`: Kiểm tra lỗi code với ESLint.
*   `npm run scan-local`: Chạy thử nghiệm OpenGrep quét thư mục hiện tại qua CLI.

---

## 🛡️ License

Private / Internal Project.
Built with ❤️ by **Antigravity**.
