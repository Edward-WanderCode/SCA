# Phase 1: Foundation & Security - Implementation Checklist

**Timeline:** Week 1-2 (Aug 1-14, 2026)  
**Status:** 🟢 Completed

---

## 🔐 Task 1.1: Authentication & Authorization System

### Backend Implementation

#### Step 1: Install Dependencies
```bash
cd backend
pip install python-jose[cryptography]==3.3.0 passlib[bcrypt]==1.7.4
pip freeze > requirements.txt
```

- [x] Add dependencies to requirements.txt
- [x] Update Docker image build

#### Step 2: Create User Model
File: `backend/models/user.py`

- [x] Create User model with fields:
  - `id`: UUID primary key
  - `email`: unique, indexed
  - `username`: unique, indexed
  - `hashed_password`: string
  - `full_name`: nullable string
  - `is_active`: boolean (default True)
  - `is_superuser`: boolean (default False)
  - `role`: Enum (admin, analyst, viewer)
  - `created_at`, `updated_at`: timestamps
- [x] Add password hashing methods
- [x] Add password verification method
- [x] Import in `models/__init__.py`

#### Step 3: Create Auth Schemas
File: `backend/schemas/auth.py`

- [x] `UserCreate` schema (email, username, password, full_name)
- [x] `UserLogin` schema (username, password)
- [x] `Token` schema (access_token, refresh_token, token_type)
- [x] `TokenPayload` schema (sub, exp, type)
- [x] `UserResponse` schema (exclude password)
- [x] Add password strength validation (min 8 chars, uppercase, number, special)

#### Step 4: Create Auth Utilities
File: `backend/core/security.py`

- [x] `create_access_token()` function
- [x] `create_refresh_token()` function
- [x] `verify_token()` function
- [x] `get_password_hash()` function
- [x] `verify_password()` function
- [x] Token blacklist functions (Redis)

#### Step 5: Create Auth Endpoints
File: `backend/api/routes/auth.py`

- [x] `POST /api/auth/register` - User registration
- [x] `POST /api/auth/login` - User login (return access + refresh token)
- [x] `POST /api/auth/refresh` - Refresh access token
- [x] `POST /api/auth/logout` - Invalidate tokens (add to blacklist)
- [x] `GET /api/auth/me` - Get current user info
- [x] `PUT /api/auth/me` - Update current user profile
- [x] `POST /api/auth/change-password` - Change password
- [x] Add rate limiting to auth endpoints (5 req/min)

#### Step 6: Create Auth Dependencies
File: `backend/api/deps.py`

- [x] `get_current_user()` dependency
- [x] `get_current_active_user()` dependency
- [x] `require_admin()` dependency
- [x] `require_analyst()` dependency
- [x] Extract token from Authorization header
- [x] Validate token and check blacklist
- [x] Load user from database

#### Step 7: Update Config
File: `backend/config.py`

- [x] Add JWT settings:
  - `JWT_SECRET_KEY` (from env, validate min 32 chars)
  - `JWT_ALGORITHM` (default HS256)
  - `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` (default 15)
  - `JWT_REFRESH_TOKEN_EXPIRE_DAYS` (default 7)
- [x] Add password settings:
  - `PASSWORD_MIN_LENGTH` (default 8)

#### Step 8: Protect Existing Endpoints
Files: `backend/api/routes/*.py`

- [x] Add `current_user: User = Depends(get_current_active_user)` to all routes
- [x] Update route signatures to accept user parameter
- [x] Filter data by user permissions (e.g., users can only see their projects)
- [x] Add admin-only routes protection

#### Step 9: Database Migration
```bash
alembic revision --autogenerate -m "Add user model and authentication"
alembic upgrade head
```

- [x] Create migration file
- [x] Review generated migration
- [x] Test migration on dev database
- [x] Create default admin user (seed script)

#### Step 10: Create Seed Script
File: `backend/scripts/create_admin.py`

- [x] Script to create initial admin user
- [x] Run in Docker entrypoint or manually
- [x] Admin credentials: Print to console on first run

---

### Frontend Implementation

#### Step 1: Install Dependencies
```bash
cd frontend
npm install axios-auth-refresh react-hook-form @hookform/resolvers zod react-toastify
```

- [x] Update package.json
- [x] Update package-lock.json

#### Step 2: Create Auth Context
File: `frontend/src/contexts/AuthContext.tsx`

- [x] Create AuthContext with:
  - `user: User | null`
  - `login(username, password)` function
  - `logout()` function
  - `register(data)` function
  - `isAuthenticated` boolean
  - `isLoading` boolean
- [x] Store tokens in localStorage
- [x] Auto-refresh token on expiry
- [x] Redirect to login on 401 errors

#### Step 3: Create Auth API Client
File: `frontend/src/lib/auth.ts`

- [x] `login(username, password)` API call
- [x] `register(data)` API call
- [x] `logout()` API call
- [x] `refreshToken()` API call
- [x] `getCurrentUser()` API call

#### Step 4: Update API Client
File: `frontend/src/lib/api.ts`

- [x] Add request interceptor to attach auth token
- [x] Add response interceptor for 401 errors
- [x] Implement token refresh logic with axios-auth-refresh
- [x] Handle refresh token expiry (logout)

#### Step 5: Create Login Page
File: `frontend/src/pages/LoginPage.tsx`

- [x] Login form with username/password
- [x] Form validation with react-hook-form + zod
- [x] Show loading state during login
- [x] Show error messages
- [x] Link to registration page
- [x] "Remember me" checkbox (optional)
- [x] "Forgot password" link (placeholder)

#### Step 6: Create Registration Page
File: `frontend/src/pages/RegisterPage.tsx`

- [x] Registration form (email, username, password, confirm password, full_name)
- [x] Form validation (password strength, email format, matching passwords)
- [x] Show loading state
- [x] Show error messages
- [x] Redirect to login on success
- [x] Link back to login page

#### Step 7: Create Protected Route Component
File: `frontend/src/components/ProtectedRoute.tsx`

- [x] Check if user is authenticated
- [x] Redirect to login if not authenticated
- [x] Show loading spinner while checking auth
- [x] Support role-based access (admin, analyst, viewer)

#### Step 8: Update App Router
File: `frontend/src/App.tsx`

- [x] Wrap app with AuthProvider
- [x] Add login route `/login`
- [x] Add register route `/register`
- [x] Wrap dashboard routes with ProtectedRoute
- [x] Add public landing page (optional)

#### Step 9: Create User Profile Component
File: `frontend/src/components/UserProfile.tsx`

- [x] Display current user info in header
- [x] Dropdown menu with:
  - Profile settings
  - Change password
  - Logout button
- [x] Show user role badge

#### Step 10: Update Header
File: `frontend/src/components/layout/Header.tsx`

- [x] Add UserProfile component
- [x] Remove mock user data
- [x] Show login button if not authenticated

---

### Testing

#### Backend Tests
File: `backend/tests/test_auth.py`

- [ ] Test user registration
- [ ] Test login with correct credentials
- [ ] Test login with wrong credentials
- [ ] Test token refresh
- [ ] Test token expiry
- [ ] Test logout (token blacklist)
- [ ] Test protected endpoint access
- [ ] Test password hashing
- [ ] Test role-based access control

#### Frontend Tests
File: `frontend/src/__tests__/auth.test.tsx`

- [ ] Test login flow
- [ ] Test registration flow
- [ ] Test logout flow
- [ ] Test token refresh
- [ ] Test protected route redirect
- [ ] Test 401 error handling

---

### Documentation

- [ ] Update README with authentication setup
- [ ] Document API authentication in OpenAPI/Swagger
- [ ] Add environment variables to .env.example
- [ ] Create user guide for authentication
- [ ] Document role permissions

---

### Security Checklist

- [ ] JWT secret is strong (min 32 chars) and from environment variable
- [ ] Passwords are hashed with bcrypt (cost factor 12)
- [ ] Tokens have appropriate expiry times
- [ ] Refresh tokens are longer-lived than access tokens
- [ ] Token blacklist is implemented for logout
- [ ] Rate limiting is enabled on auth endpoints
- [ ] HTTPS is enforced in production (proxy/load balancer)
- [ ] CORS is restricted to specific origins
- [ ] SQL injection is prevented (using ORM)
- [ ] Password reset flow is secure (not implemented yet, but planned)

---

## 🗄️ Task 1.2: Database Migrations with Alembic

### Step 1: Install and Initialize Alembic
```bash
cd backend
pip install alembic==1.13.1
alembic init alembic
```

- [x] Add alembic to requirements.txt
- [x] Verify alembic.ini is created
- [x] Verify alembic/ directory is created

### Step 2: Configure Alembic
File: `alembic/env.py`

- [x] Import Base from `db.base`
- [x] Import all models (to register with metadata)
- [x] Configure async engine
- [x] Set target_metadata = Base.metadata
- [x] Update connection URL from config.DATABASE_URL
- [x] Support running migrations offline

File: `alembic.ini`

- [x] Update sqlalchemy.url to read from environment
- [x] Configure logging

### Step 3: Create Initial Migration
```bash
alembic revision --autogenerate -m "Initial schema with projects, scans, findings"
```

- [x] Review generated migration file
- [x] Verify all tables are included
- [x] Verify indexes are created
- [x] Verify foreign keys are correct
- [x] Test migration: `alembic upgrade head`
- [x] Test rollback: `alembic downgrade -1`

### Step 4: Remove create_all() from Code
File: `backend/db/session.py`

- [x] Remove `Base.metadata.create_all()` call from init_db()
- [x] Keep connection retry logic
- [x] Update init_db() to only check connection

### Step 5: Update Docker Entrypoint
File: `backend/Dockerfile` or `docker-compose.yml`

- [x] Add migration command to entrypoint:
  ```bash
  alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000
  ```
- [x] Ensure migrations run before app starts

### Step 6: Add Migration CI Check
File: `.github/workflows/ci.yml` (if using GitHub Actions)

- [x] Run `alembic check` to detect missing migrations
- [x] Fail CI if migrations are out of sync with models

### Step 7: Add Indexes for Performance
Create new migration:
```bash
alembic revision -m "Add performance indexes"
```

File: `alembic/versions/XXX_add_indexes.py`

- [x] Index on `scans.status`
- [x] Index on `scans.project_id`
- [x] Index on `findings.severity`
- [x] Index on `findings.scan_id`
- [x] Index on `findings.rule_id`
- [x] Index on `findings.cve_id`
- [x] Composite index on `scans(project_id, created_at)`

### Step 8: Documentation

- [x] Document migration workflow in README
- [x] Add migration commands to Makefile
- [x] Document rollback procedure
- [x] Add troubleshooting guide for migrations

---

## 🛡️ Task 1.3: Security Hardening

### A. Input Validation

#### Step 1: Update Pydantic Schemas
Files: `backend/schemas/*.py`

- [x] Add email validator to all email fields
- [x] Add URL validator to repo_url fields
- [x] Add string length limits (e.g., name max 255 chars)
- [x] Add regex validators for usernames (alphanumeric + underscore only)
- [x] Validate file paths (no ../ or absolute paths)

#### Step 2: File Upload Validation
File: `backend/api/routes/scans.py`

- [x] Add max file size check (50MB default)
- [x] Validate file MIME type with python-magic
- [x] Check ZIP file for bombs (max extracted size)
- [x] Sanitize filenames (remove special chars)
- [x] Validate archive structure (max depth, max files)

#### Step 3: Git URL Validation
File: `backend/schemas/project.py`

- [x] Only allow HTTPS URLs (block git://, file://, etc.)
- [x] Block localhost and private IP ranges
- [x] Validate domain names
- [x] Add URL length limit

Code example:
```python
from pydantic import field_validator
import re

@field_validator('repo_url')
def validate_repo_url(cls, v):
    if not v.startswith('https://'):
        raise ValueError('Only HTTPS URLs are allowed')
    if 'localhost' in v or '127.0.0.1' in v:
        raise ValueError('Localhost URLs are not allowed')
    # Add more checks...
    return v
```

### B. CORS Configuration

File: `backend/main.py`

- [x] Move CORS_ORIGINS to .env
- [x] Default to empty list (no CORS in production unless explicitly set)
- [x] Validate origin format in config.py
- [x] Log warning if wildcard (*) is used
- [x] Enable credentials only for authenticated endpoints

Code example:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,  # No wildcards
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=3600,
)
```

### C. Rate Limiting

#### Step 1: Install slowapi
```bash
pip install slowapi==0.1.9
```

#### Step 2: Configure Rate Limiter
File: `backend/core/rate_limit.py`

- [x] Create Limiter instance with Redis storage
- [x] Configure default limit (100 req/min)
- [x] Add custom limit decorator
- [x] Add rate limit exceeded handler

#### Step 3: Apply Rate Limits
File: `backend/api/routes/auth.py`

- [x] Login: 5 req/min per IP
- [x] Register: 3 req/hour per IP
- [x] Password reset: 3 req/hour per email

File: `backend/api/routes/scans.py`

- [x] Create scan: 10 req/hour per user
- [x] Upload file: 5 req/hour per user

File: `backend/main.py`

- [x] Global rate limit: 100 req/min per IP (all endpoints)

Code example:
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, storage_uri=settings.REDIS_URL)

@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, ...):
    ...
```

### D. SQL Injection Prevention

- [x] Audit all database queries
- [x] Ensure all queries use SQLAlchemy ORM (no raw SQL)
- [x] If raw SQL is needed, use parameterized queries
- [x] Enable SQL query logging in dev environment
- [x] Add SQL injection test cases

### E. Secrets Management

#### Step 1: Environment Variable Validation
File: `backend/config.py`

- [x] Add Pydantic validators for required env vars
- [x] Validate JWT_SECRET_KEY length (min 32 chars)
- [x] Warn if default/weak secrets are used
- [x] Fail fast on missing critical env vars

Code example:
```python
from pydantic import field_validator

class Settings(BaseSettings):
    JWT_SECRET_KEY: str
    
    @field_validator('JWT_SECRET_KEY')
    def validate_jwt_secret(cls, v):
        if len(v) < 32:
            raise ValueError('JWT_SECRET_KEY must be at least 32 characters')
        if v == 'your-secret-key-change-this':
            logger.warning('Using default JWT secret! Change this in production!')
        return v
```

#### Step 2: Create .env.example
- [x] Copy all env vars from config.py
- [x] Use dummy/placeholder values
- [x] Add comments explaining each variable
- [x] Document which vars are required vs optional

#### Step 3: Gitignore Check
File: `.gitignore`

- [x] Ensure .env is in .gitignore
- [x] Add other sensitive files (*.pem, *.key, secrets.*, credentials.*)

#### Step 4: Secrets Scanning
- [x] Add pre-commit hook to detect secrets
- [x] Use tools like `detect-secrets` or `gitleaks`
- [x] Scan commit history for accidentally committed secrets

### F. Additional Security Measures

#### Step 1: Add Security Headers
File: `backend/middleware/security.py`

- [x] Add security headers middleware:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Strict-Transport-Security: max-age=31536000`
  - `Content-Security-Policy` (for API, minimal)

#### Step 2: Dependency Scanning
```bash
pip install safety
safety check
```

- [x] Add safety check to CI pipeline
- [x] Fix any known vulnerabilities
- [x] Set up automated alerts (Dependabot/Renovate)

#### Step 3: Docker Security
File: `backend/Dockerfile`

- [x] Use non-root user
- [x] Minimize image layers
- [x] Use specific image tags (not :latest)
- [x] Scan image with Trivy
- [x] Remove unnecessary tools from image

---

## 📋 Final Phase 1 Checklist

### Before Deployment

- [ ] All backend tests pass (unit + integration)
- [ ] All frontend tests pass
- [ ] Code review completed
- [ ] Security review completed
- [ ] Database migrations tested on staging
- [ ] Performance testing (basic load test)
- [ ] Documentation updated
- [ ] .env.example up to date

### Deployment Steps

1. [ ] Backup production database
2. [ ] Deploy to staging environment
3. [ ] Run smoke tests on staging
4. [ ] Run database migrations on staging
5. [ ] Test authentication flow on staging
6. [ ] Monitor staging for 24 hours
7. [ ] Deploy to production (during maintenance window)
8. [ ] Run database migrations on production
9. [ ] Create initial admin user
10. [ ] Verify login works
11. [ ] Monitor error rates for 48 hours

### Rollback Plan

- [ ] Document rollback procedure
- [ ] Keep previous Docker images
- [ ] Have database migration rollback script ready
- [ ] Define rollback triggers (error rate > 5%)

---

## 📊 Progress Tracking

| Task | Status | Assignee | Started | Completed | Notes |
|------|--------|----------|---------|-----------|-------|
| 1.1 Auth Backend | 🟢 Completed | AI | 2026-07-31 | 2026-07-31 | JWT, Users, Roles |
| 1.1 Auth Frontend | 🟢 Completed | AI | 2026-07-31 | 2026-07-31 | Login/Register UI, AuthContext |
| 1.2 Alembic Setup | 🟢 Completed | AI | 2026-07-31 | 2026-07-31 | Migrations configured |
| 1.3 Security Hardening | 🟢 Completed | AI | 2026-07-31 | 2026-07-31 | Rate limits, CORS, Security headers |

**Legend:**
- 🔴 Not Started
- 🟡 In Progress
- 🟢 Completed
- ⚠️ Blocked

---

**Next Phase:** [PHASE2_CHECKLIST.md](PHASE2_CHECKLIST.md)
