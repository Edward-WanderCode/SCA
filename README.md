# 🔒 SCA Platform - Static Code Analysis Platform

Nền tảng phân tích mã nguồn tĩnh toàn diện, tự triển khai với dashboard hiện đại.

> **⚠️ UPGRADE IN PROGRESS:** See [UPGRADE_PLAN.md](UPGRADE_PLAN.md) for version 2.0 roadmap  
> **📚 Quick Start:** See [GETTING_STARTED.md](GETTING_STARTED.md) for development setup

## ✨ Tính năng

- ⚡ **Combined Scanning (Quét kết hợp)** - Luôn tự động kết hợp toàn bộ các bộ máy quét (SAST với OpenGrep, Vulnerability với Trivy, và Secrets với TruffleHog) vào trong một phiên quét duy nhất.
- 📊 **Báo cáo HTML Chuyên nghiệp** - Tự động tạo và gửi kèm file báo cáo HTML tĩnh độc lập (Premium Dark Mode) chi tiết các phát hiện.
- 🤖 **Tích hợp Telegram Bot** - Tự động tạo Topic dự án riêng biệt, thông báo tiến độ, ghim kết quả quét và hỗ trợ kích hoạt quét trực tiếp bằng cách tải tệp zip/rar lên.
- 📈 **Modern Dashboard** - Giao diện trực quan với analytics, reporting và tracking xu hướng.
- 🐳 **Docker Ready** - Dễ dàng triển khai toàn bộ hệ thống với Docker Compose.

## 🏗️ Kiến trúc

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Frontend  │ ───> │   Backend    │ ───> │  Scanners   │
│  (React)    │ <─── │  (FastAPI)   │ <─── │ Semgrep     │
└─────────────┘      └──────────────┘      │ Trivy       │
                            │               │ TruffleHog  │
                            ↓               └─────────────┘
                     ┌──────────────┐
                     │  PostgreSQL  │
                     └──────────────┘
```

## 🚀 Cài đặt

### Prerequisites

- Python 3.10+
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL (hoặc dùng Docker)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Docker Setup (Recommended)

Trước khi khởi chạy bằng Docker Compose, hãy tạo file `.env` từ file `.env.example` và cấu hình các biến môi trường cho Telegram Bot:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_or_group_id
TELEGRAM_BOT_COMMAND_THREAD_ID=306  # ID của Topic nhận file zip/rar để quét
```

Sau đó khởi chạy toàn bộ dịch vụ:

```bash
docker-compose build
docker-compose up -d
```

## 📖 Sử dụng

1. Truy cập dashboard: http://localhost:3000
2. Tạo dự án mới hoặc liên kết Git repository cần quét.
3. Kích hoạt quét: Nhấn **Start Scan** (Hệ thống sẽ tự động quét toàn diện với chế độ **Combined Scan**).
4. Xem kết quả trực tiếp trên Dashboard hoặc nhận thông tin kèm tệp đính kèm **HTML Report** gửi tới Topic của dự án trên Telegram.
5. Quét qua Telegram Bot: Gửi tệp zip/rar mã nguồn vào topic `Bot Command` và nhấn nút **Bắt đầu quét** được phản hồi bởi Bot.

## 🛠️ Tech Stack

**Backend:**
- FastAPI - Web framework
- SQLAlchemy - ORM
- Celery - Task queue
- Redis - Cache & message broker
- PostgreSQL - Database

**Frontend:**
- React 18 - UI framework
- TypeScript - Type safety
- Tailwind CSS - Styling
- shadcn/ui - Component library
- React Query - Data fetching
- Recharts - Data visualization

**Security Tools:**
- Semgrep - SAST scanning
- Trivy - Vulnerability scanning
- TruffleHog - Secret detection

## 📝 License

MIT License
