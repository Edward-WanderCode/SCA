# SCA Platform - Quick Start Guide

## 📚 Documentation Index

1. **[UPGRADE_PLAN.md](UPGRADE_PLAN.md)** - Comprehensive upgrade plan (10 weeks, 5 phases)
2. **[PHASE1_CHECKLIST.md](PHASE1_CHECKLIST.md)** - Detailed Phase 1 implementation checklist
3. **[.env.example](.env.example)** - Environment variables template
4. **[scripts/dev.py](scripts/dev.py)** - Development command-line tool
5. **[backend/scripts/create_admin.py](backend/scripts/create_admin.py)** - Admin user creation script

---

## 🎯 Upgrade Plan Summary

### Current Issues (Priority Order)
1. 🔴 **P0 - Critical**
   - No authentication system (open API)
   - No database migrations (schema changes are risky)
   
2. 🟠 **P1 - High**
   - No test coverage
   - No monitoring/logging
   - Security vulnerabilities (CORS, rate limiting)
   
3. 🟡 **P2 - Medium**
   - No retry logic for external services
   - No resource cleanup
   - Poor error handling

### Upgrade Phases

```
Phase 1 (Week 1-2): Foundation & Security
├── Authentication & Authorization (JWT)
├── Database Migrations (Alembic)
└── Security Hardening (CORS, rate limiting, validation)

Phase 2 (Week 3-4): Reliability & Observability
├── Error Handling & Retry Logic
├── Structured Logging (Loguru)
├── Health Checks & Monitoring (Prometheus)
└── Resource Cleanup Jobs

Phase 3 (Week 5-6): Testing & Quality
├── Unit Tests (80%+ coverage)
├── Integration Tests (API endpoints)
└── E2E Tests (Playwright)

Phase 4 (Week 7-8): Performance & Scale
├── Caching Strategy (Redis)
├── Enhanced Rate Limiting
├── File Streaming
└── Scanner Optimization

Phase 5 (Week 9-10): Features & UX
├── CI/CD Integration (GitHub/GitLab webhooks)
├── Multi-channel Notifications (Email, Slack)
└── Advanced Features (JIRA, SARIF export, scheduling)
```

---

## 🚀 Getting Started with Upgrades

### Prerequisites
```bash
# Python 3.10+
python --version

# Node.js 18+
node --version

# Docker & Docker Compose
docker --version
docker-compose --version

# Git
git --version
```

### Step 1: Setup Development Environment

```bash
# Clone and navigate to project
cd d:/Code/SCA

# Copy environment file
cp .env.example .env

# Edit .env and set:
# - JWT_SECRET_KEY (min 32 chars, generate with: openssl rand -hex 32)
# - TELEGRAM_BOT_TOKEN (if using Telegram)
# - CORS_ORIGINS (your frontend URL)

# Install dependencies
python scripts/dev.py install
```

### Step 2: Start Infrastructure

```bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Wait for services to be ready (check with docker-compose ps)

# Or start all services
python scripts/dev.py docker-up
```

### Step 3: Run Database Migrations (After Phase 1)

```bash
# Initialize Alembic (first time only)
cd backend
alembic init alembic

# Create initial migration
alembic revision --autogenerate -m "Initial schema"

# Apply migrations
python ../scripts/dev.py migrate

# Create admin user
python ../scripts/dev.py create-admin
```

### Step 4: Start Development Servers

**Option A: Manual (Recommended for development)**
```bash
# Terminal 1: Backend
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2: Celery Worker
cd backend
celery -A workers.celery_app worker --loglevel=info

# Terminal 3: Frontend
cd frontend
npm run dev
```

**Option B: Docker (Recommended for testing)**
```bash
python scripts/dev.py docker-up
```

Access:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8001
- API Docs: http://localhost:8001/api/docs

---

## 📋 Implementation Workflow

### For Each Phase:

1. **Create Feature Branch**
   ```bash
   git checkout -b phase1/authentication
   ```

2. **Follow Phase Checklist**
   - Open [PHASE1_CHECKLIST.md](PHASE1_CHECKLIST.md)
   - Check off tasks as you complete them
   - Commit frequently with clear messages

3. **Run Tests**
   ```bash
   python scripts/dev.py test
   ```

4. **Run Linters**
   ```bash
   python scripts/dev.py lint
   ```

5. **Security Check**
   ```bash
   python scripts/dev.py security-check
   ```

6. **Create Pull Request**
   - Title: `[Phase 1] Add authentication system`
   - Description: Link to checklist, list completed tasks
   - Request review from team

7. **Deploy to Staging**
   ```bash
   # After PR approval
   git checkout main
   git pull
   python scripts/dev.py docker-build
   python scripts/dev.py docker-up
   ```

8. **Test on Staging**
   - Manual smoke tests
   - Automated E2E tests
   - Performance tests

9. **Deploy to Production**
   - Schedule maintenance window
   - Backup database
   - Run migrations
   - Deploy with blue-green strategy
   - Monitor for 48 hours

---

## 🛠️ Development Commands

We've created a unified command-line tool: `scripts/dev.py`

```bash
# Install dependencies
python scripts/dev.py install

# Database operations
python scripts/dev.py migrate          # Apply migrations
python scripts/dev.py rollback         # Rollback last migration
python scripts/dev.py create-admin     # Create admin user

# Testing
python scripts/dev.py test             # Run tests
python scripts/dev.py test-cov         # Run with coverage report

# Code quality
python scripts/dev.py lint             # Run linters
python scripts/dev.py format           # Format code
python scripts/dev.py security-check   # Check vulnerabilities

# Docker operations
python scripts/dev.py docker-build     # Build images
python scripts/dev.py docker-up        # Start services
python scripts/dev.py docker-down      # Stop services

# Utilities
python scripts/dev.py clean            # Clean temp files
python scripts/dev.py dev              # Show dev server commands
```

---

## 📊 Progress Tracking

### Phase 1 Status (Week 1-2)
- [ ] 1.1 Authentication & Authorization
  - [ ] Backend: User model, JWT, auth endpoints
  - [ ] Frontend: Login page, auth context, protected routes
  - [ ] Tests: Auth flow tests
- [ ] 1.2 Database Migrations
  - [ ] Alembic setup
  - [ ] Initial migration
  - [ ] Performance indexes
- [ ] 1.3 Security Hardening
  - [ ] Input validation
  - [ ] CORS restriction
  - [ ] Rate limiting
  - [ ] Secrets management

**Start Date:** 2026-08-01  
**Target Completion:** 2026-08-14  
**Estimated Hours:** 80 hours  

---

## 🔍 Key Files Created/Modified

### New Files Created Today
```
✅ UPGRADE_PLAN.md                          - Master upgrade plan
✅ PHASE1_CHECKLIST.md                      - Phase 1 detailed checklist
✅ scripts/dev.py                           - Development CLI tool
✅ backend/scripts/create_admin.py          - Admin user creation
✅ backend/core/exceptions.py               - Custom exception classes
✅ backend/api/error_handlers.py            - Global error handlers
```

### Files to Create in Phase 1
```
⏳ backend/models/user.py                   - User model
⏳ backend/schemas/auth.py                  - Auth schemas
⏳ backend/core/security.py                 - JWT utilities
⏳ backend/api/routes/auth.py               - Auth endpoints
⏳ frontend/src/contexts/AuthContext.tsx    - Auth state management
⏳ frontend/src/pages/LoginPage.tsx         - Login UI
⏳ frontend/src/pages/RegisterPage.tsx      - Registration UI
⏳ alembic/versions/001_initial.py          - Initial migration
⏳ alembic/versions/002_add_users.py        - User table migration
```

---

## 🧪 Testing Strategy

### Unit Tests (Phase 3)
```bash
# Backend
cd backend
pytest tests/test_parsers/           # Parser tests
pytest tests/test_models/            # Model tests
pytest tests/test_services/          # Service tests

# Frontend
cd frontend
npm test
```

### Integration Tests (Phase 3)
```bash
# API endpoint tests
cd backend
pytest tests/integration/
```

### E2E Tests (Phase 3)
```bash
# Full workflow tests
cd frontend
npx playwright test
```

### Coverage Goal
- Unit tests: 80%+ coverage
- Integration tests: All critical paths
- E2E tests: Core user workflows

---

## 🔐 Security Considerations

### Phase 1 Security Checklist
- [ ] JWT secret is strong (32+ chars) and from environment
- [ ] Passwords hashed with bcrypt (cost factor 12)
- [ ] Token expiry configured (access: 15min, refresh: 7days)
- [ ] CORS restricted to specific origins (no wildcards)
- [ ] Rate limiting enabled (5 req/min on auth, 100 req/min global)
- [ ] Input validation on all user inputs
- [ ] File upload validation (size, type, content)
- [ ] Git URL validation (HTTPS only, block localhost)
- [ ] SQL injection prevented (ORM only)
- [ ] Secrets not committed (check .gitignore)

### Security Tools to Add
```bash
# Dependency scanning
pip install safety
safety check

# Secret scanning
pip install detect-secrets
detect-secrets scan

# SAST scanning (use our own platform!)
# Vulnerability scanning with Trivy
docker run --rm -v $(pwd):/src aquasec/trivy:latest fs /src
```

---

## 📈 Monitoring Setup (Phase 2)

### Metrics to Track
- API response time (p50, p95, p99)
- Request rate (per endpoint)
- Error rate (per endpoint)
- Scan duration (by type)
- Scanner success/failure rate
- Database query time
- Celery queue length
- Cache hit rate

### Alerting Rules
- Error rate > 5% for 5 minutes → Page on-call
- API response time p95 > 1s → Slack alert
- Celery queue > 100 jobs → Investigate
- Disk usage > 80% → Email alert
- Scanner failure rate > 10% → Slack alert

---

## 🚢 Deployment Strategy

### Blue-Green Deployment
1. Deploy new version (green) alongside old (blue)
2. Run smoke tests on green
3. Switch traffic to green (update load balancer)
4. Monitor for 1 hour
5. If issues: switch back to blue
6. If stable: decommission blue after 24 hours

### Database Migration Strategy
1. Create backward-compatible migration
2. Deploy migration to production
3. Deploy new app version
4. Verify app works with new schema
5. (Optional) Remove old columns in next release

### Rollback Plan
- Keep previous 3 Docker images
- Database rollback scripts tested
- Feature flags for new features
- Monitoring dashboard with rollback button

---

## 💡 Best Practices

### Git Workflow
```bash
# Feature branch naming
phase1/authentication
phase2/logging
bugfix/scanner-timeout
hotfix/security-cors

# Commit message format
[Phase 1] Add JWT authentication system

- Implement User model with password hashing
- Add login/register endpoints
- Create JWT token utilities
- Add authentication middleware

Closes #123
```

### Code Review Checklist
- [ ] Code follows project style guide
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No secrets committed
- [ ] Error handling implemented
- [ ] Logging added for key events
- [ ] Security reviewed
- [ ] Performance considered

### Pull Request Template
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Checklist
- [ ] Tests pass
- [ ] Linters pass
- [ ] Documentation updated
- [ ] No security issues

## Related Issues
Closes #123
```

---

## 🆘 Troubleshooting

### Common Issues

**Database connection refused**
```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Restart
docker-compose restart postgres
```

**Migration failed**
```bash
# Check current migration state
alembic current

# Rollback
alembic downgrade -1

# Try again
alembic upgrade head
```

**Celery worker not processing tasks**
```bash
# Check worker status
celery -A workers.celery_app inspect active

# Check Redis connection
redis-cli ping

# Restart worker
docker-compose restart celery_worker
```

**Frontend build errors**
```bash
# Clear cache
rm -rf node_modules package-lock.json
npm install

# Or use dev script
python scripts/dev.py clean
cd frontend && npm install
```

---

## 📞 Getting Help

### Resources
- **Upgrade Plan:** [UPGRADE_PLAN.md](UPGRADE_PLAN.md)
- **Phase Checklist:** [PHASE1_CHECKLIST.md](PHASE1_CHECKLIST.md)
- **API Docs:** http://localhost:8001/api/docs
- **FastAPI Docs:** https://fastapi.tiangolo.com/
- **React Query Docs:** https://tanstack.com/query/latest

### Questions?
1. Check documentation first
2. Search existing issues/PRs
3. Ask in team chat
4. Create GitHub issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details

---

## 🎉 Next Steps

1. **Review the upgrade plan** - Read [UPGRADE_PLAN.md](UPGRADE_PLAN.md) thoroughly
2. **Set up development environment** - Follow steps above
3. **Start with Phase 1** - Open [PHASE1_CHECKLIST.md](PHASE1_CHECKLIST.md)
4. **Create feature branch** - `git checkout -b phase1/authentication`
5. **Implement step by step** - Follow checklist, commit frequently
6. **Run tests** - Ensure everything works
7. **Submit PR** - Get review, iterate, merge
8. **Deploy to staging** - Test in production-like environment
9. **Deploy to production** - With proper backups and monitoring
10. **Move to Phase 2** - Repeat the process

**Good luck with the upgrade! 🚀**

---

*Last Updated: 2026-07-31*  
*Version: 2.0.0-planning*
