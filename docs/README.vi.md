<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Prisma-6-2D3748?style=for-the-badge&logo=prisma" alt="Prisma" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
</p>

# 🛡️ SCA — Công Cụ Phân Tích Mã Nguồn Tĩnh

> **Nền tảng phân tích mã nguồn tĩnh toàn diện, tự triển khai** — tích hợp quét SAST, phát hiện lỗ hổng bảo mật, và phòng chống rò rỉ bí mật trong một giao diện dashboard hiện đại.

🇬🇧 [English version](../README.md)

---

## ✨ Tính năng

| Tính năng | Mô tả |
|-----------|-------|
| 🔍 **Quét SAST** | Sử dụng OpenGrep (tương thích Semgrep) với hơn 2.000 rules cộng đồng |
| 🛡️ **Phát hiện lỗ hổng** | Tích hợp Trivy để quét CVE trong dependencies và containers |
| 🔑 **Phát hiện bí mật** | Quét API keys, tokens, credentials bằng TruffleHog |
| 🧹 **Tích hợp Linter** | Hỗ trợ sẵn Ruff, ESLint, và GolangCI-Lint |
| 📊 **Xuất SARIF** | Định dạng chuẩn, tương thích GitHub Security, VS Code, v.v. |
| 📄 **Báo cáo PDF** | Xuất báo cáo lỗ hổng chuyên nghiệp, sẵn sàng chia sẻ |
| 🤖 **Telegram Bot** | Quét từ xa và nhận thông báo qua Telegram |
| 🌲 **Cây thư mục** | Hiển thị cây mã nguồn tương tác với chú thích finding |
| 📈 **Dashboard** | Điểm sức khỏe bảo mật real-time và phân tích lịch sử quét |
| 🔄 **Quét tăng dần** | So sánh kết quả giữa các lần quét để theo dõi tiến trình khắc phục |

## 🏗️ Kiến trúc

```
SCA/
├── src/
│   ├── app/              # Next.js App Router (pages & API routes)
│   │   ├── api/          # REST API endpoints
│   │   │   ├── scan/     # Điều phối quét
│   │   │   ├── history/  # Quản lý lịch sử quét
│   │   │   ├── telegram/ # Telegram bot webhooks
│   │   │   └── upload/   # Xử lý upload file
│   │   ├── scan/         # Trang quét mới
│   │   ├── results/      # Xem kết quả quét
│   │   ├── history/      # Lịch sử quét
│   │   ├── rules/        # Trình duyệt rules
│   │   ├── vulnerabilities/ # Khám phá lỗ hổng
│   │   ├── terminal/     # Terminal agent
│   │   └── settings/     # Cài đặt ứng dụng
│   ├── components/       # React components tái sử dụng
│   └── lib/              # Logic cốt lõi
│       ├── scanner.ts    # Bộ điều phối scan engine
│       ├── linter.ts     # Chạy linter đa ngôn ngữ
│       ├── sarif.ts      # Chuyển đổi định dạng SARIF
│       ├── telegram.ts   # Tích hợp Telegram bot
│       └── pdf-export.ts # Tạo báo cáo PDF
├── prisma/               # Database schema & migrations (SQLite)
├── scripts/              # Scripts thiết lập & bảo trì
├── OpenGrep/             # SAST engine (tải tự động)
├── Trivy/                # Vulnerability scanner (tải tự động)
└── TruffleHog/           # Secret scanner (tải tự động)
```

## 🚀 Bắt đầu nhanh

### Yêu cầu hệ thống

- **Node.js** ≥ 20.x
- **Windows** 10/11 (các scan engine là binary Windows)
- **Git**

### Cài đặt

```bash
# 1. Clone repository
git clone https://github.com/Edward-WanderCode/SCA.git
cd SCA

# 2. Cài đặt dependencies
npm install

# 3. Thiết lập environment
cp .env.example .env
# Chỉnh sửa .env theo cấu hình của bạn

# 4. Khởi tạo database
npx prisma migrate dev
npx prisma generate

# 5. Tải scan engines (OpenGrep, Trivy, TruffleHog)
npm run setup

# 6. Khởi động development server
npm run dev
```

Ứng dụng sẽ chạy tại **http://localhost:3000**.

### Các lệnh có sẵn

| Lệnh | Mô tả |
|-------|-------|
| `npm run dev` | Khởi động development server |
| `npm run build` | Build cho production |
| `npm run start` | Khởi động production server |
| `npm run lint` | Chạy ESLint |
| `npm run setup` | Tải binary scan engines |
| `npm run update-rules` | Cập nhật rules bảo mật OpenGrep |
| `npm run cleanup-temp` | Dọn dẹp file quét tạm |

## 🔧 Cấu hình

### Biến môi trường

Sao chép `.env.example` thành `.env` và cấu hình:

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `DATABASE_URL` | Không | Đường dẫn SQLite database (mặc định: `file:./prisma/dev.db`) |
| `TELEGRAM_BOT_TOKEN` | Không | Token API Telegram Bot để quét từ xa |
| `TELEGRAM_CHAT_ID` | Không | ID chat Telegram để nhận thông báo |

### Nguồn quét

SCA hỗ trợ nhiều phương thức nhập liệu:

- **📁 Thư mục local** — Duyệt và chọn thư mục trên server
- **📤 Upload file** — Tải lên mã nguồn nén (ZIP, TAR.GZ)
- **🔗 Git URL** — Clone và quét repository từ xa
- **🤖 Telegram** — Gửi file hoặc repo qua Telegram bot

## 🤝 Đóng góp

Chúng tôi chào đón mọi đóng góp! Vui lòng đọc [Hướng dẫn đóng góp](CONTRIBUTING.vi.md) để biết chi tiết.

- 🐛 [Báo cáo lỗi](https://github.com/Edward-WanderCode/SCA/issues/new?template=bug_report.md)
- 💡 [Đề xuất tính năng](https://github.com/Edward-WanderCode/SCA/issues/new?template=feature_request.md)
- 🔒 [Báo cáo lỗ hổng bảo mật](SECURITY.vi.md)

## 📜 Giấy phép

Dự án này được cấp phép theo [MIT License](../LICENSE).

---

<p align="center">
  Made with ❤️ bởi <a href="https://github.com/Edward-WanderCode">Edward-WanderCode</a>
</p>
