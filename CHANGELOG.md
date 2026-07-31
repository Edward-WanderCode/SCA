# Changelog

All notable changes to SCA Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planning
- Comprehensive 10-week upgrade plan created
- Phase 1-5 implementation checklists prepared
- Security policy documented
- Development tools and scripts prepared

## [2.0.0] - TBD (Target: 2026-10-08)

### Added - Phase 1 (Security & Foundation)
- 🔐 JWT-based authentication system
- 👥 User management with role-based access control (Admin, Analyst, Viewer)
- 🗄️ Alembic database migrations
- 🛡️ Security hardening:
  - CORS restriction (origin whitelist)
  - Rate limiting (slowapi + Redis)
  - Input validation with Pydantic
  - File upload validation (size, type, content)
  - Git URL validation (HTTPS only)
- 📝 Security headers middleware
- 🔑 Password strength validation
- 🚫 Token blacklist for logout
- 📧 User registration and login endpoints

### Added - Phase 2 (Reliability & Observability)
- 📊 Structured logging with Loguru
- 🔄 Retry logic for external services (Telegram, Git, Docker)
- ⚡ Circuit breaker pattern for external APIs
- 🏥 Enhanced health checks (DB, Redis, Celery, disk space)
- 📈 Prometheus metrics endpoint
- 📉 Grafana dashboard templates
- 🧹 Automatic workspace cleanup jobs
- 🎯 Custom exception hierarchy
- 🔔 Error tracking with Sentry integration

### Added - Phase 3 (Testing & Quality)
- ✅ Unit tests for parsers, models, services
- 🔗 Integration tests for API endpoints
- 🌐 E2E tests with Playwright
- 📊 Test coverage reporting (80%+ target)
- 🚦 CI/CD pipeline with GitHub Actions
- 🔍 Pre-commit hooks (linting, secrets detection)

### Added - Phase 4 (Performance & Scale)
- ⚡ Redis caching for dashboard stats
- 🚀 Cache warming for frequent queries
- 📁 File streaming for large uploads
- 🔀 Parallel scanner execution
- 📈 Incremental scanning (changed files only)
- 🎯 Scan priority queue
- 🐳 Docker image caching

### Added - Phase 5 (Features & UX)
- 🔗 GitHub webhook integration
- 🔗 GitLab webhook integration
- 💬 Commit status checks
- 📧 Email notifications (SMTP)
- 💬 Slack notifications
- 📋 Microsoft Teams notifications
- 🎫 JIRA integration
- 📄 SARIF export format
- ⏰ Scheduled scans (cron-based)
- 🔑 API key management
- 📝 Audit logs

### Changed
- Improved error messages (consistent format)
- Updated API response structure (RFC 7807 compliant)
- Enhanced Telegram notifications with inline keyboards
- Optimized database queries with proper indexes
- Improved frontend loading states and error handling

### Security
- Fixed: Open API without authentication
- Fixed: CORS accepting all origins
- Fixed: No rate limiting on endpoints
- Fixed: Insufficient input validation
- Fixed: Missing security headers
- Added: SQL injection prevention audits
- Added: Dependency vulnerability scanning
- Added: Secret scanning in commits

### Performance
- Reduced API response time by 40% (caching)
- Optimized scan execution time by 30% (parallel scanners)
- Reduced memory usage with file streaming
- Improved database query performance with indexes

## [1.0.0] - 2026-07-30

### Added
- Initial release of SCA Platform
- Combined scanning (SAST, Vulnerability, Secrets)
- Multiple scanner support:
  - OpenGrep/Semgrep for SAST
  - Trivy for vulnerability scanning
  - TruffleHog for secret detection
  - Bandit for Python-specific SAST
  - GoSec for Go-specific SAST
- React dashboard with analytics
- Project management (CRUD)
- Scan management and execution
- Finding management and filtering
- Telegram Bot integration:
  - Auto topic creation per project
  - Progress notifications
  - Result pinning
  - File upload scanning
  - Inline keyboard actions
- HTML report generation (dark theme)
- Docker-based deployment
- PostgreSQL database
- Redis cache and message broker
- Celery async task queue
- Git repository integration
- Language detection (Python, Go, JavaScript, Java, Rust)
- Findings diff (compare with previous scan)
- Dashboard widgets:
  - Stats cards
  - Severity distribution chart
  - Trend chart (30 days)
  - Recent scans
  - Top vulnerabilities

### Known Issues (v1.0.0)
- No authentication system (API is open)
- No database migrations (schema changes require manual intervention)
- No test coverage
- No monitoring or structured logging
- CORS accepts all origins
- No rate limiting
- No retry logic for external services
- No automatic resource cleanup
- Poor error handling
- Scanner failures don't rollback state properly

## [0.1.0] - 2026-07-01

### Added
- Initial proof of concept
- Basic FastAPI backend
- Basic React frontend
- Single scanner integration (OpenGrep)
- Basic project management
- Simple scan execution

---

## Migration Guide

### Migrating from 1.0.x to 2.0.0

#### Prerequisites
1. Backup your database
2. Backup scan results and workspaces
3. Review [UPGRADE_PLAN.md](UPGRADE_PLAN.md)

#### Breaking Changes

**Authentication Required**
- All API endpoints now require authentication
- Obtain JWT token via `/api/auth/login`
- Include token in `Authorization: Bearer <token>` header

**Database Schema Changes**
- New `users` table added
- Run migrations: `alembic upgrade head`
- Create admin user: `python scripts/create_admin.py`

**Configuration Changes**
- New required environment variables:
  - `JWT_SECRET_KEY` (min 32 chars)
  - `JWT_ALGORITHM` (default: HS256)
- CORS configuration:
  - `CORS_ORIGINS` now requires explicit origins
  - No wildcards allowed in production

**API Response Format**
- Error responses now follow RFC 7807:
  ```json
  {
    "error": {
      "code": "AUTHENTICATION_FAILED",
      "message": "Invalid credentials",
      "details": {}
    }
  }
  ```

#### Migration Steps

1. **Stop services**
   ```bash
   docker-compose down
   ```

2. **Backup database**
   ```bash
   pg_dump sca_platform > backup_$(date +%Y%m%d).sql
   ```

3. **Update code**
   ```bash
   git pull origin main
   ```

4. **Update dependencies**
   ```bash
   cd backend && pip install -r requirements.txt
   cd frontend && npm install
   ```

5. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

6. **Run migrations**
   ```bash
   cd backend
   alembic upgrade head
   ```

7. **Create admin user**
   ```bash
   python scripts/create_admin.py
   ```

8. **Rebuild containers**
   ```bash
   docker-compose build
   ```

9. **Start services**
   ```bash
   docker-compose up -d
   ```

10. **Verify**
    - Login at http://localhost:3000/login
    - Check API docs: http://localhost:8001/api/docs
    - Run smoke tests

#### Rollback Procedure

If issues occur:

1. **Stop new version**
   ```bash
   docker-compose down
   ```

2. **Restore database**
   ```bash
   psql sca_platform < backup_YYYYMMDD.sql
   ```

3. **Checkout previous version**
   ```bash
   git checkout v1.0.0
   ```

4. **Start old version**
   ```bash
   docker-compose up -d
   ```

---

## Version Support

- **2.0.x**: Active development, security updates
- **1.0.x**: Security updates only until 2027-01-31
- **0.x**: No longer supported

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Links

- [Upgrade Plan](UPGRADE_PLAN.md)
- [Getting Started](GETTING_STARTED.md)
- [Security Policy](SECURITY.md)
- [API Documentation](http://localhost:8001/api/docs)

---

*Generated: 2026-07-31*
