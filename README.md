# Source Code Analysis (SCA) System

Hệ thống phân tích mã nguồn (SCA) hiện đại, hỗ trợ quét lỗ hổng bảo mật, bí mật (secrets) và chất lượng mã nguồn một cách tự động. Công cụ này tích hợp nhiều engine mạnh mẽ để cung cấp cái nhìn toàn diện về tình trạng an ninh của dự án.

## 🚀 Tính Năng Chính

- **Quét Đa Năng (Multi-Engine Scanning):**
  - **SAST (Static Analysis Security Testing):** Sử dụng OpenGrep (fork của Semgrep) để phát hiện các mẫu code không an toàn.
  - **Secret Detection:** Phát hiện rò rỉ API Keys, Passwords, Tokens bằng TruffleHog.
  - **Infrastructure/Container Scanning:** Tích hợp Trivy để kiểm tra các lỗ hổng trong dependencies và cấu hình.
  - **Linting:** Tích hợp các linter phổ biến (Ruff, ESLint, GolangCI-Lint) để đảm bảo tiêu chuẩn code.
- **Báo Cáo Chi Tiết:**
  - Giao diện Dashboard trực quan với biểu đồ thống kê mức độ nghiêm trọng (Critical, High, Medium, Low).
  - Danh sách lỗ hổng chi tiết kèm theo vị trí file, dòng code và gợi ý sửa lỗi (Fix suggestions).
  - Xuất báo cáo định dạng **PDF** chuyên nghiệp.
- **Tích Hợp Hệ Thống:**
  - Hỗ trợ gửi thông báo kết quả quét trực tiếp qua **Telegram**.
  - Lưu trữ lịch sử quét để so sánh sự thay đổi giữa các phiên bản (Rescan comparison).
- **Giao Diện Hiện Đại:**
  - Xây dựng trên Next.js 16 với giao diện mượt mà (Framer Motion).
  - Hỗ trợ Dark Mode và thiết kế Responsive.

## 🛠️ Công Nghệ Sử Dụng

- **Frontend:** Next.js 15+, TypeScript, Tailwind CSS v4, Framer Motion.
- **Database:** SQLite (thông qua Prisma ORM).
- **Visualization:** Recharts cho các biểu đồ thống kê.
- **Security Engines:** OpenGrep, Trivy, TruffleHog.
- **Notification:** Telegram Bot API.

## 📋 Yêu Cầu Hệ Thống

- **Node.js:** v20 trở lên.
- **OS:** Windows (hỗ trợ tốt nhất qua các shell script đi kèm).
- **Công cụ bổ trợ:** Đã cài đặt Git.

## ⚙️ Cài Đặt

1. **Clone repository:**
   ```bash
   git clone <repository-url>
   cd SCA
   ```

2. **Cài đặt dependencies:**
   ```bash
   npm install
   ```

3. **Cấu hình môi trường:**
   Tạo file `.env` từ `.env.example` và điền các thông tin cần thiết (DATABASE_URL, NEXTAUTH_SECRET, v.v.).

4. **Thiết lập cơ sở dữ liệu và engine:**
   ```bash
   npx prisma generate
   npx prisma db push
   npm run setup
   ```
   *Lưu ý: Lệnh `setup` sẽ tải xuống các engine cần thiết (OpenGrep, v.v.).*

## 📖 Hướng Dẫn Sử Dụng

- **Chạy ứng dụng ở chế độ phát triển:**
  ```bash
   npm run dev
  ```
  Truy cập `http://localhost:3000` để bắt đầu.

- **Thực hiện quét cục bộ:**
  Bạn có thể chọn thư mục hoặc tải lên mã nguồn trực tiếp từ giao diện web để hệ thống thực hiện phân tích tự động.

- **Cập nhật rules:**
  ```bash
  npm run update-rules
  ```

## 📄 Xuất Báo Cáo
Sau khi kết thúc quá trình quét, bạn có thể xem chi tiết từng lỗ hổng và nhấn nút **Export PDF** để tải về báo cáo tóm tắt dành cho quản lý hoặc báo cáo kỹ thuật chi tiết.

## 🤝 Đóng Góp
Mọi ý kiến đóng góp và báo lỗi xin vui lòng tạo Issue hoặc Pull Request trên repository này.

---
*Phát triển bởi Edward-WanderCode.*
