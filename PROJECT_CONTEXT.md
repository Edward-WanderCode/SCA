# SCA Platform — Context & Architecture Guide for AI Assistants

> **Lưu ý cho AI Assistant:** File này chứa toàn bộ kiến trúc, sơ đồ dữ liệu, luồng xử lý và cấu hình của dự án Static Code Analysis (SCA) Platform. 
> Đọc file này giúp bạn hiểu toàn bộ codebase mà không cần duyệt lại tất cả các tệp nguồn.

---

## 1. Tổng quan Dự án (Project Overview)
- **Tên dự án:** SCA Platform (Static Code Analysis Platform)
- **Mục đích:** Hệ thống quét an ninh mã nguồn tự động, phát hiện lỗ hổng SAST (mã nguồn), Vulnerability/SCA (thư viện bên thứ ba), và Secrets/Credentials bị lộ.
- **Đối tượng sử dụng:** Dự án cá nhân (Single-User Personal Security Dashboard & Telegram Bot).
- **Cách thức vận hành:**
  - Qua **Web Dashboard (React + Vite)**
  - Qua **Telegram Bot (Interactive Telegram Commands, File ZIP Upload, Callback Buttons)**
  - Qua **CI/CD Webhooks (GitHub / GitLab)**

---

## 2. Kiến trúc Hệ thống (System Architecture)

```
                     ┌─────────────────────────────────────────┐
                     │               User Client               │
                     └────┬──────────────────────────────┬─────┘
                          │ (HTTP / REST)                │ (Telegram API)
                          ▼                              ▼
                 ┌──────────────────┐           ┌──────────────────┐
                 │  Frontend (Vite) │           │ Telegram Bot API │
                 └────────┬─────────┘           └────────┬─────────┘
                          │                              │
                          └──────────────┬───────────────┘
                                         ▼
                             ┌──────────────────────┐
                             │ Backend API (FastAPI)│
                             └──────────┬───────────┘
                                        │
                 ┌──────────────────────┼──────────────────────┐
                 ▼                      ▼                      ▼
        ┌────────────────┐     ┌────────────────┐    ┌─────────────────┐
        │ PostgreSQL 16  │     │    Redis 7     │    │  Celery Worker  │
        │ (AsyncPG DB)   │     │ (Broker/Cache) │    │(Background Task)│
        └────────────────┘     └────────────────┘    └────────┬────────┘
                                                              │
                                             ┌─────────────────┴─────────────────┐
                                             ▼                                   ▼
                                   ┌───────────────────┐               ┌───────────────────┐
                                   │ Local CLI Binaries│               │ Docker Engines    │
                                   │ (OpenGrep, Trivy, │               │    (Fallback)     │
                                   │ TruffleH, Bandit, │               └───────────────────┘
                                   │      GoSec)       │
                                   └───────────────────┘
```

### Component Stack:
1. **Frontend:** React 18, Vite, TypeScript, TailwindCSS, Lucide Icons, Axios.
2. **Backend API:** FastAPI (Async/Await), SQLAlchemy 2.0 (AsyncPG), Pydantic v2.
3. **Task Queue & Async Workers:** Celery + Redis.
4. **Database:** PostgreSQL 16 (AsyncPG connection pool).
5. **Scanners Integration (Local CLI Native):**
   - **OpenGrep:** Polyglot SAST
   - **Trivy:** Dependency Vulnerabilities (SCA)
   - **TruffleHog:** Secrets & Credentials Detection
   - **Bandit:** Python SAST
   - **GoSec:** Go SAST
   *(Tự động fallback về Docker Container nếu cờ `USE_LOCAL_* = False`)*
6. **Telegram Integration:** Bot Polling / Webhook + Local Telegram Bot API Server (`aiogram/telegram-bot-api`) hỗ trợ upload file tới 2GB.

---

## 3. Cấu trúc thư mục (Directory Structure)

```
SCA/
├── docker-compose.yml              # Configuration for Postgres, Redis, Backend, Worker, Frontend, Telegram API
├── PROJECT_CONTEXT.md              # Master documentation file for AI context
├── start_all.ps1 / start_all.bat   # Script khởi động toàn bộ services local (non-Docker)
├── stop_all.ps1 / stop_all.bat     # Script dừng toàn bộ services local
├── view_logs.ps1 / view_logs.bat   # Script xem logs từng service
├── tools/                          # Công cụ scanner binary & data chạy local trên Windows
│   ├── scanners/                   # Binary scanner Windows
│   │   ├── opengrep.exe            # OpenGrep binary (Windows)
│   │   ├── trufflehog.exe          # TruffleHog binary (Windows)
│   │   └── docs/                   # Tài liệu scanner
│   ├── logs/                       # Logs của các services khi chạy local
│   ├── pgsql/                      # PostgreSQL data directory (local)
│   └── redis/                      # Redis data directory (local)
├── backend/
│   ├── main.py                     # FastAPI Entry point & Middleware setup
│   ├── config.py                   # Pydantic Settings & Environment Variables
│   ├── alembic/                    # Database migration scripts (Alembic)
│   ├── alembic.ini                 # Alembic configuration
│   ├── requirements.txt            # Python dependencies
│   ├── Dockerfile                  # Backend Docker image definition
│   ├── host_code/                  # Thư mục mount code local khi phát triển (thường để trống)
│   ├── api/                        # REST API Layer
│   │   ├── deps.py                 # Auth & DB Dependencies
│   │   ├── error_handlers.py       # Global Exception Handlers
│   │   └── routes/                 # API Endpoints
│   │       ├── auth.py             # Đăng ký / đăng nhập / JWT
│   │       ├── projects.py         # CRUD dự án
│   │       ├── scans.py            # Trigger & quản lý scan
│   │       ├── results.py          # Kết quả quét chi tiết, filter & pagination findings, cập nhật trạng thái finding
│   │       ├── dashboard.py        # Thống kê tổng quan
│   │       ├── settings.py         # Cài đặt hệ thống & người dùng
│   │       ├── webhooks.py         # Nhận webhook từ GitHub / GitLab
│   │       └── health.py           # Health check endpoint
│   ├── core/                       # Core utilities
│   │   ├── cache.py                # Redis cache helpers
│   │   ├── exceptions.py           # Custom exception classes
│   │   ├── logging.py              # Logging configuration
│   │   ├── metrics.py              # Metrics collection
│   │   ├── rate_limit.py           # Rate limiting
│   │   ├── retry.py                # Retry logic helpers
│   │   └── security.py             # JWT & password hashing
│   ├── middleware/                 # FastAPI Middleware
│   │   └── logging.py              # Request/Response logging middleware
│   ├── db/                         # Database session & Base model
│   ├── models/                     # SQLAlchemy ORM Models
│   │   ├── project.py
│   │   ├── scan.py
│   │   ├── finding.py
│   │   ├── user.py
│   │   └── setting.py
│   ├── schemas/                    # Pydantic schemas for request/response validation
│   ├── services/                   # Business logic & Scanner orchestration
│   │   ├── scan_service.py         # Executes scanners & language detection
│   │   ├── webhook_service.py      # GitHub / GitLab status updates
│   │   └── parsers/                # JSON output parsers
│   │       ├── bandit_parser.py
│   │       ├── gosec_parser.py
│   │       ├── opengrep_parser.py
│   │       ├── trivy_parser.py
│   │       └── trufflehog_parser.py
│   ├── utils/                      # Helper functions
│   │   ├── telegram.py             # Telegram API helpers (gửi tin nhắn, file, pin)
│   │   ├── telegram_bot.py         # Telegram Bot handler (commands, callbacks, ZIP upload)
│   │   ├── scanner_utils.py        # Tiện ích chạy scanner process & parse output
│   │   ├── report_generator.py     # Tạo báo cáo HTML
│   │   └── path_utils.py           # Tiện ích xử lý đường dẫn file
│   ├── workers/                    # Celery app & background tasks
│   │   ├── celery_app.py           # Khởi tạo Celery instance & cấu hình
│   │   ├── tasks.py                # Celery tasks chính (run_scan_task, run_zip_scan_task...)
│   │   ├── schedule_tasks.py       # Scheduled/periodic tasks (cron scans)
│   │   ├── cleanup_tasks.py        # Dọn dẹp workspace & dữ liệu cũ
│   │   └── db.py                   # DB session helper cho Celery workers
│   ├── scripts/                    # Dev & maintenance scripts
│   │   ├── create_admin.py         # Tạo user admin ban đầu
│   │   └── warm_cache.py           # Warm up Redis cache
│   ├── tests/                      # Unit & integration tests (pytest + .coveragerc)
│   └── workspace/                  # Ephemeral directory for code cloning & ZIP extraction
├── frontend/
│   ├── src/
│   │   ├── pages/                  # DashboardPage, ProjectsPage, ScansPage, FindingsPage, SettingsPage, LoginPage, RegisterPage
│   │   ├── components/             # UI Components
│   │   │   ├── ProjectSettingsModal.tsx
│   │   │   ├── WebhookConfigModal.tsx
│   │   │   ├── ProtectedRoute.tsx
│   │   │   ├── UserProfile.tsx
│   │   │   ├── dashboard/          # Dashboard-specific components
│   │   │   ├── layout/             # Layout components (Sidebar, Header...)
│   │   │   └── scans/              # Scan-related components
│   │   ├── contexts/               # AuthContext, ThemeContext
│   │   ├── types/                  # TypeScript type definitions (index.ts)
│   │   └── lib/                    # API Client (Axios)
└── scripts/                        # Helper dev scripts (dev.py)
```

---

## 4. Mô hình Dữ liệu (Database Schema & Models)

### Bảng `projects` ([backend/models/project.py](file:///d:/Code/SCA/backend/models/project.py))
- `id` (UUID, Primary Key)
- `name` (String, Indexed)
- `repo_url` (String) — URL Git hoặc đường dẫn file/folder local
- `description` (Text)
- `branch` (String, Default: "main")
- `language` (String)
- `webhook_secret` (String)
- `provider` (String: github, gitlab, local, telegram)
- `cron_schedule` (String)
- `enabled_scanners` (JSON array: `["secret", "vulnerability", "sast"]`)
- `telegram_topic_id` (Integer) — Thread ID trong Telegram Supergroup

### Bảng `scans` ([backend/models/scan.py](file:///d:/Code/SCA/backend/models/scan.py))
- `id` (UUID, Primary Key)
- `project_id` (UUID, Foreign Key -> `projects.id`)
- `scan_type` (Enum: `sast`, `vulnerability`, `secret`, `combined`)
- `status` (Enum: `pending`, `running`, `completed`, `failed`)
- `celery_task_id` (String)
- `telegram_message_id` (Integer)
- `progress` (Integer: 0..100)
- `progress_message` (String)
- `summary` (JSON: thống kê số lượng critical, high, medium, low, info)
- `file_hashes` (JSON: hash MD5/SHA256 của các file trong dự án dùng để tối ưu rescan)
- `findings_diff` (JSON: `{"added": X, "removed": Y, "unmodified": Z}`)

### Bảng `findings` ([backend/models/finding.py](file:///d:/Code/SCA/backend/models/finding.py))
- `id` (UUID, Primary Key)
- `scan_id` (UUID, Foreign Key -> `scans.id`)
- `severity` (Enum: `critical`, `high`, `medium`, `low`, `info`)
- `title` (String)
- `description` (Text)
- `file_path` (String)
- `line_start` / `line_end` (Integer)
- `code_snippet` (Text)
- `rule_id` / `cve_id` (String)
- `cvss_score` (Float)
- `package_name` / `package_version` / `fixed_version` (String)
- `detector_type` (String)
- `status` (String: `open`, `ignored`, `resolved`, `false_positive`)

---

## 5. Luồng xử lý chính (Core Pipelines & Features)

### 5.1 Luồng Quét mã nguồn (Scanning Pipeline)
1. **Trigger:** Qua API `/api/scans/run` hoặc qua Telegram Bot `/scan` / Upload file ZIP.
2. **Celery Task Dispatch:** Task `run_scan_task` / `run_local_scan_task` / `run_zip_scan_task` được đưa vào Redis Queue.
3. **Pipeline Execution ([backend/workers/tasks.py](file:///d:/Code/SCA/backend/workers/tasks.py)):**
   - **Tải/Giải nén mã nguồn:** Clone repository hoặc giải nén file ZIP vào `/app/workspace/projects/`.
   - **Tối ưu hóa Rescan (Hash Check):** So sánh `file_hashes` với lần quét `COMPLETED` gần nhất. Nếu mã nguồn hoàn toàn không đổi -> Bỏ qua quét thực tế, khôi phục kết quả cũ.
   - **Nhận diện Ngôn ngữ Auto-detect:** `ScanService.detect_languages()` phát hiện Python, Go, JS/TS, Java, Rust...
   - **Chạy Scanner Engine:** Chạy song song (Parallel) các công cụ phù hợp qua Docker hoặc Local Command.
   - **Baseline Management:** Tự động kế thừa trạng thái `ignored` từ các lần quét trước.
   - **Lưu Findings & Compute Diff:** Đánh dấu lỗi mới (`is_new`), lỗi đã sửa, lỗi trùng lặp.
   - **Thông báo Telegram & HTML Report:** Tạo báo cáo HTML đẹp mắt qua `generate_html_report()` và gửi đính kèm file trong Telegram topic riêng của dự án, đồng thời Pin tin nhắn kết quả mới nhất.

### 5.2 Tương tác qua Telegram Bot ([backend/utils/telegram_bot.py](file:///d:/Code/SCA/backend/utils/telegram_bot.py))
- Nhận diện lệnh: `/start`, `/help`, `/projects`, `/scan`, `/stats`, `/clean`.
- Upload trực tiếp file `.zip` mã nguồn -> Tự động giải nén, tạo dự án và kích hoạt Combined Scan.
- Menu điều hướng Callback Buttons: Chọn dự án, Chọn kiểu quét (`Combined`, `SAST`, `Vulnerability`, `Secret`), Rescan, Xóa dự án.
- Tự động tạo Telegram Forum Topic riêng cho từng dự án để quản lý thông báo gọn gàng.

### 5.3 Route `results.py` — Kết quả Quét Chi tiết
- Endpoint phục vụ filtering & pagination findings theo `scan_id`.
- Hỗ trợ filter theo severity, status, detector_type, keyword search.
- Endpoint cập nhật trạng thái finding: `ignore`, `resolve`, `false_positive`.

---

## 6. Cấu hình Môi trường (.env & config.py)

| Variable | Default Value | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://...` | PostgreSQL Async Connection String |
| `REDIS_URL` | `redis://redis:6379/0` | Redis Connection String |
| `JWT_SECRET_KEY` | *(Secret String)* | Key giải mã JWT Authentication |
| `TELEGRAM_BOT_TOKEN` | *(Token)* | Bot Token từ BotFather |
| `TELEGRAM_CHAT_ID` | *(Chat ID)* | Supergroup Chat ID để nhận thông báo |
| `USE_LOCAL_OPENGREP` | `True` | Sử dụng binary OpenGrep cài local trên container |
| `USE_LOCAL_TRIVY` | `True` | Sử dụng binary Trivy cài local trên container |
| `USE_LOCAL_TRUFFLEHOG` | `True` | Sử dụng binary TruffleHog cài local trên container |
| `USE_LOCAL_BANDIT` | `True` | Sử dụng binary Bandit (Python) cài local trên container |
| `USE_LOCAL_GOSEC` | `True` | Sử dụng binary GoSec cài local trên container |
| `SCAN_WORKSPACE_DIR` | `/app/workspace` | Thư mục tạm chứa code đang quét |

---

## 7. Đánh giá & Hướng phát triển cho Dự án Cá nhân (Personal Tool Perspective)

### Ưu điểm nổi bật:
- **Tự động hóa cực cao:** Upload ZIP là có báo cáo HTML và thông báo Telegram sau vài giây.
- **Tiết kiệm tài nguyên:** Nhờ Rescan Hash Optimization, các dự án không sửa code sẽ hoàn tất quét trong < 1 giây.
- **Giao diện đa dạng:** Vừa có Web UI trực quan, vừa có Telegram Bot tương tác 2 chiều mượt mà.

### Khuyến nghị tối ưu cho 1 người dùng:
1. **Dọn dẹp tự động (Auto-cleanup workspace):** Thêm cronjob dọn dẹp các thư mục temp trong `/app/workspace` định kỳ để không làm dầy ổ đĩa.
2. **Local Binaries Execution:** Nếu chạy trực tiếp trên Linux host hoặc Docker, việc cài đặt `trivy` và `trufflehog` trực tiếp làm CLI thay vì chạy Docker-in-Docker sẽ giúp tốc độ quét nhanh hơn gấp 2-3 lần.
