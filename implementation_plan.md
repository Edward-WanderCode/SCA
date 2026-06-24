# 🔒 SCA Platform — Nền tảng Phân tích Mã nguồn Tĩnh Toàn diện

Xây dựng nền tảng tự triển khai (self-hosted) tích hợp quét SAST, phát hiện lỗ hổng bảo mật, và phòng chống rò rỉ bí mật trong một dashboard hiện đại.

## User Review Required

> [!IMPORTANT]
> **Tech Stack Confirmation**: README đã xác định stack là FastAPI + React/TypeScript + Tailwind + shadcn/ui. Tôi sẽ theo đúng stack này. Bạn có muốn thay đổi gì không?

> [!WARNING]  
> **Docker Dependencies**: Các scanner (OpenGrep, Trivy, TruffleHog) sẽ được chạy qua Docker containers. Bạn cần Docker Engine đã cài sẵn trên máy triển khai.

> [!IMPORTANT]
> **Database**: Plan sử dụng PostgreSQL + Redis theo README. Trong mode development, có thể fallback sang SQLite nếu bạn chưa có PostgreSQL.

## Open Questions

> [!IMPORTANT]
> 1. **Authentication**: Bạn có cần hệ thống đăng nhập (JWT auth) ngay từ đầu không, hay phiên bản đầu tiên không cần auth?
> 2. **CI/CD Integration**: Bạn có cần tích hợp webhook từ GitHub/GitLab để tự động trigger scan không?
> 3. **Notifications**: Bạn có cần tính năng gửi alert qua email/Slack khi phát hiện lỗ hổng critical không?

---

## Kiến trúc Tổng quan

```mermaid
graph TB
    subgraph Frontend["🖥️ Frontend - React + TypeScript"]
        Dashboard["Dashboard Overview"]
        ScanPage["Scan Management"]
        ResultsPage["Results Viewer"]
        Settings["Settings"]
    end

    subgraph Backend["⚙️ Backend - FastAPI"]
        API["REST API"]
        ScanService["Scan Service"]
        TaskQueue["Celery Workers"]
    end

    subgraph Scanners["🔍 Security Scanners"]
        OpenGrep["OpenGrep - SAST"]
        Trivy["Trivy - CVE/Vuln"]
        TruffleHog["TruffleHog - Secrets"]
    end

    subgraph Data["💾 Data Layer"]
        PostgreSQL["PostgreSQL"]
        Redis["Redis - Broker/Cache"]
    end

    Frontend -->|HTTP/REST| API
    API --> ScanService
    ScanService --> TaskQueue
    TaskQueue --> OpenGrep
    TaskQueue --> Trivy
    TaskQueue --> TruffleHog
    API --> PostgreSQL
    TaskQueue --> Redis
    API --> Redis
```

---

## Proposed Changes

### 1. Backend — FastAPI Application

Cấu trúc thư mục:

```
backend/
├── main.py                    # FastAPI app entry point
├── config.py                  # Settings & env configuration
├── requirements.txt           # Python dependencies
├── alembic.ini               # DB migrations config
├── alembic/
│   └── versions/             # Migration files
├── api/
│   ├── __init__.py
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── scans.py          # Scan CRUD & trigger endpoints
│   │   ├── results.py        # Scan results endpoints
│   │   ├── projects.py       # Project management
│   │   └── dashboard.py      # Dashboard stats/analytics
│   └── deps.py               # Shared dependencies
├── models/
│   ├── __init__.py
│   ├── project.py            # Project model
│   ├── scan.py               # Scan model  
│   └── finding.py            # Finding/vulnerability model
├── schemas/
│   ├── __init__.py
│   ├── project.py            # Pydantic schemas
│   ├── scan.py
│   └── finding.py
├── services/
│   ├── __init__.py
│   ├── scan_service.py       # Scan orchestration logic
│   └── parsers/
│       ├── __init__.py
│       ├── opengrep_parser.py  # Parse OpenGrep JSON/SARIF
│       ├── trivy_parser.py     # Parse Trivy JSON
│       └── trufflehog_parser.py # Parse TruffleHog JSON
├── workers/
│   ├── __init__.py
│   ├── celery_app.py         # Celery configuration
│   └── tasks.py              # Async scan tasks
├── db/
│   ├── __init__.py
│   ├── session.py            # Database session management
│   └── base.py               # Base model class
└── utils/
    ├── __init__.py
    └── scanner_utils.py      # Docker/CLI invocation helpers
```

#### [NEW] [main.py](file:///d:/Code/SCA/backend/main.py)
- FastAPI application initialization
- CORS middleware configuration
- Router registration (scans, results, projects, dashboard)
- Health check endpoint
- Startup/shutdown events (DB connection pool, Redis)

#### [NEW] [config.py](file:///d:/Code/SCA/backend/config.py)
- Pydantic Settings class với env vars:
  - `DATABASE_URL`, `REDIS_URL`
  - `OPENGREP_IMAGE` (default: `ghcr.io/opengrep/opengrep:latest`)
  - `TRIVY_IMAGE` (default: `aquasecurity/trivy:latest`)
  - `TRUFFLEHOG_IMAGE` (default: `trufflesecurity/trufflehog:latest`)
  - `SCAN_WORKSPACE_DIR` (nơi clone repos)

#### [NEW] [models/](file:///d:/Code/SCA/backend/models/)
Database models (SQLAlchemy ORM):

| Model | Fields | Purpose |
|-------|--------|---------|
| **Project** | id, name, repo_url, description, created_at, updated_at | Quản lý dự án |
| **Scan** | id, project_id, scan_type (enum: SAST/VULN/SECRET), status (enum: PENDING/RUNNING/COMPLETED/FAILED), started_at, completed_at, summary_json | Theo dõi quét |
| **Finding** | id, scan_id, severity (CRITICAL/HIGH/MEDIUM/LOW/INFO), title, description, file_path, line_start, line_end, code_snippet, rule_id, cve_id, metadata_json | Kết quả phát hiện |

#### [NEW] [services/scan_service.py](file:///d:/Code/SCA/backend/services/scan_service.py)
Logic điều phối scan:
1. Clone/checkout repository vào workspace
2. Dispatch Celery task tương ứng loại scan
3. Cập nhật trạng thái scan trong DB
4. Tổng hợp kết quả sau scan

#### [NEW] [services/parsers/](file:///d:/Code/SCA/backend/services/parsers/)

**OpenGrep Parser** (`opengrep_parser.py`):
- Chạy: `docker run --rm -v {repo_path}:/src opengrep/opengrep --json /src`
- Parse SARIF/JSON output → Finding records
- Map severity levels (ERROR → CRITICAL, WARNING → HIGH, etc.)

**Trivy Parser** (`trivy_parser.py`):
- Chạy: `docker run --rm -v {repo_path}:/src aquasecurity/trivy fs --format json /src`
- Parse JSON output → Finding records  
- Extract CVE ID, CVSS score, affected package, fixed version

**TruffleHog Parser** (`trufflehog_parser.py`):
- Chạy: `docker run --rm -v {repo_path}:/src trufflesecurity/trufflehog filesystem --json /src`
- Parse JSON stream (line-by-line) → Finding records
- Extract detector type, verification status, source location

#### [NEW] [workers/](file:///d:/Code/SCA/backend/workers/)
- Celery app configuration với Redis broker
- Tasks: `run_sast_scan`, `run_vuln_scan`, `run_secret_scan`
- Mỗi task: invoke Docker container → parse output → save findings → update scan status

#### [NEW] [api/routes/](file:///d:/Code/SCA/backend/api/routes/)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects` | GET/POST | List/Create projects |
| `/api/projects/{id}` | GET/PUT/DELETE | CRUD project |
| `/api/scans` | GET/POST | List/Trigger scans |
| `/api/scans/{id}` | GET | Scan details + status |
| `/api/scans/{id}/findings` | GET | Findings for a scan (paginated, filterable) |
| `/api/dashboard/stats` | GET | Aggregate stats (total scans, findings by severity, trends) |
| `/api/dashboard/recent` | GET | Recent scans & critical findings |

---

### 2. Frontend — React + TypeScript + Vite

Cấu trúc thư mục:

```
frontend/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── postcss.config.js
├── tailwind.config.js
├── components.json           # shadcn/ui config
├── src/
│   ├── main.tsx
│   ├── App.tsx               # Router + Layout
│   ├── index.css             # Global styles + Tailwind
│   ├── lib/
│   │   ├── api.ts            # API client (axios/fetch)
│   │   └── utils.ts          # Utilities
│   ├── hooks/
│   │   ├── useScans.ts       # React Query hooks
│   │   ├── useProjects.ts
│   │   └── useDashboard.ts
│   ├── types/
│   │   └── index.ts          # TypeScript interfaces
│   ├── components/
│   │   ├── ui/               # shadcn/ui components
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx   # Navigation sidebar
│   │   │   ├── Header.tsx    # Top bar
│   │   │   └── Layout.tsx    # Main layout wrapper
│   │   ├── dashboard/
│   │   │   ├── StatsCards.tsx     # Summary cards (Total scans, Criticals, etc.)
│   │   │   ├── SeverityChart.tsx  # Donut/Pie chart by severity
│   │   │   ├── TrendChart.tsx     # Line chart - findings over time
│   │   │   ├── RecentScans.tsx    # Recent scan activity table
│   │   │   └── TopVulns.tsx       # Top critical vulnerabilities
│   │   ├── scans/
│   │   │   ├── ScanList.tsx       # Scans table with filters
│   │   │   ├── NewScanDialog.tsx  # Trigger new scan modal
│   │   │   ├── ScanDetail.tsx     # Single scan view
│   │   │   └── ScanProgress.tsx   # Real-time scan progress
│   │   ├── findings/
│   │   │   ├── FindingsList.tsx   # Findings table with filters
│   │   │   ├── FindingDetail.tsx  # Single finding with code view
│   │   │   └── SeverityBadge.tsx  # Severity indicator
│   │   └── projects/
│   │       ├── ProjectList.tsx
│   │       └── ProjectForm.tsx
│   └── pages/
│       ├── DashboardPage.tsx
│       ├── ScansPage.tsx
│       ├── FindingsPage.tsx
│       ├── ProjectsPage.tsx
│       └── SettingsPage.tsx
```

#### Design System — Dark Mode Premium

Thiết kế lấy cảm hứng từ các security dashboards hiện đại (Snyk, GitHub Security, SonarQube):

| Element | Style |
|---------|-------|
| **Theme** | Dark mode chủ đạo, glassmorphism panels |
| **Colors** | Slate/Zinc base, Emerald accents, severity spectrum (Red→Orange→Yellow→Blue→Gray) |
| **Typography** | Inter font family |
| **Cards** | Glass effect với backdrop-blur, subtle borders |
| **Animations** | Framer Motion: page transitions, card hover effects, counter animations |
| **Charts** | Recharts với custom colors matching design system |

#### Trang Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│ 🔒 SCA Platform          [Search]     [Notifications] [⚙️]  │
├──────────┬──────────────────────────────────────────────────┤
│          │  📊 Dashboard Overview                          │
│ 📊 Dash  │                                                  │
│ 🔍 Scans │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│ 🐛 Finds │  │Total │ │Crit  │ │High  │ │Fixed │           │
│ 📁 Projs │  │Scans │ │Vulns │ │Vulns │ │Rate  │           │
│ ⚙️ Set   │  └──────┘ └──────┘ └──────┘ └──────┘           │
│          │                                                  │
│          │  ┌─────────────────┐ ┌───────────────────┐      │
│          │  │ Severity Chart  │ │ Findings Trend    │      │
│          │  │ (Donut)         │ │ (Line Chart)      │      │
│          │  └─────────────────┘ └───────────────────┘      │
│          │                                                  │
│          │  ┌───────────────────────────────────────┐      │
│          │  │ Recent Scans                          │      │
│          │  │ ├── repo-a │ SAST    │ ✅ Done │ 12f  │      │
│          │  │ ├── repo-b │ Secrets │ 🔄 Run  │ --   │      │
│          │  │ └── repo-c │ Vuln    │ ✅ Done │ 5f   │      │
│          │  └───────────────────────────────────────┘      │
└──────────┴──────────────────────────────────────────────────┘
```

#### Key UI Features
- **Stats Cards**: Animated counters, gradient backgrounds, icon indicators
- **Severity Donut Chart**: Interactive, click-to-filter
- **Trend Line Chart**: 7/30/90 day views, area gradient fill
- **Scan List**: Status badges (Pending/Running/Done/Failed), progress indicators
- **Finding Detail**: Syntax-highlighted code snippet, severity badge, remediation guidance
- **New Scan Dialog**: Repo URL input, scan type checkboxes (multi-select), schedule options

---

### 3. Docker Compose — Deployment

#### [NEW] [docker-compose.yml](file:///d:/Code/SCA/docker-compose.yml)

```yaml
services:
  # === Data Layer ===
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: sca_platform
      POSTGRES_USER: sca_user
      POSTGRES_PASSWORD: sca_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  # === Backend ===
  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://sca_user:sca_password@postgres:5432/sca_platform
      REDIS_URL: redis://redis:6379/0
    ports:
      - "8000:8000"
    depends_on:
      - postgres
      - redis
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # Access Docker for scanners
      - scan_workspace:/app/workspace

  # === Celery Worker ===
  celery-worker:
    build: ./backend
    command: celery -A workers.celery_app worker --loglevel=info
    environment:
      DATABASE_URL: postgresql://sca_user:sca_password@postgres:5432/sca_platform
      REDIS_URL: redis://redis:6379/0
    depends_on:
      - postgres
      - redis
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - scan_workspace:/app/workspace

  # === Frontend ===
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  postgres_data:
  scan_workspace:
```

#### [NEW] [backend/Dockerfile](file:///d:/Code/SCA/backend/Dockerfile)
- Python 3.11-slim base image
- Install Docker CLI (để gọi scanner containers)
- Install Git (để clone repos)
- COPY requirements.txt → pip install
- COPY source code
- CMD uvicorn main:app

#### [NEW] [frontend/Dockerfile](file:///d:/Code/SCA/frontend/Dockerfile)
- Node 20-alpine → build stage (npm run build)
- Nginx → serve static files

---

### 4. Phụ trợ

#### [NEW] [.env.example](file:///d:/Code/SCA/.env.example)
Template biến môi trường cho deployment.

#### [MODIFY] [README.md](file:///d:/Code/SCA/README.md)
Cập nhật hướng dẫn setup chi tiết hơn.

---

## Kế hoạch Thực thi (Execution Order)

| Phase | Tasks | Est. Files |
|-------|-------|-----------|
| **Phase 1: Backend Core** | Models, DB setup, config, main.py | ~12 files |
| **Phase 2: Scanner Integration** | Parsers, scan service, Celery tasks | ~8 files |
| **Phase 3: API Routes** | CRUD endpoints, dashboard stats | ~6 files |
| **Phase 4: Frontend Setup** | Vite + React project, Tailwind, shadcn/ui | ~5 files |
| **Phase 5: Dashboard UI** | Layout, stats cards, charts, recent scans | ~10 files |
| **Phase 6: Scan & Findings UI** | Scan list, new scan, findings table, detail view | ~8 files |
| **Phase 7: Docker & Deploy** | Dockerfiles, docker-compose, .env | ~4 files |
| **Phase 8: Polish** | Animations, responsive, error handling | Incremental |

**Tổng ước tính: ~50+ files, full-stack application**

---

## Verification Plan

### Automated Tests
```bash
# Backend unit tests
cd backend && python -m pytest tests/ -v

# Frontend build verification
cd frontend && npm run build

# Docker compose up verification
docker-compose up -d && docker-compose ps
```

### Manual Verification
1. **Backend API**: Truy cập Swagger UI tại `http://localhost:8000/docs` — test tất cả endpoints
2. **Frontend Dashboard**: Truy cập `http://localhost:3000` — kiểm tra layout, charts, navigation
3. **End-to-End Scan Flow**:
   - Tạo project → trigger scan → xem kết quả
   - Verify scan status cập nhật real-time
   - Verify findings hiển thị đúng severity, code snippet
4. **Docker Deployment**: `docker-compose up` chạy thành công, tất cả services healthy
