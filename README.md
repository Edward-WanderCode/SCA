# 🔒 SCA Platform - Static Code Analysis Platform

Nền tảng phân tích mã nguồn tĩnh toàn diện, tự triển khai với dashboard hiện đại.

## ✨ Tính năng

- 🔍 **SAST Scanning** - Quét mã nguồn với Semgrep/OpenGrep
- 🛡️ **Vulnerability Detection** - Phát hiện CVE trong dependencies và containers với Trivy
- 🔑 **Secret Detection** - Phát hiện API keys, tokens, credentials với TruffleHog
- 📊 **Modern Dashboard** - Giao diện trực quan với analytics và reporting
- ⚡ **Async Processing** - Quét bất đồng bộ với Celery
- 🐳 **Docker Ready** - Dễ dàng triển khai với Docker Compose

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

```bash
docker-compose up -d
```

## 📖 Sử dụng

1. Truy cập dashboard: http://localhost:3000
2. Upload hoặc link repository cần quét
3. Chọn loại scan (SAST / Vulnerability / Secrets)
4. Xem kết quả trong dashboard

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
