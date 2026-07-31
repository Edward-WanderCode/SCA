# Contributing to SCA Platform

Thank you for considering contributing to SCA Platform! This document provides guidelines and instructions for contributing.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Workflow](#development-workflow)
4. [Coding Standards](#coding-standards)
5. [Testing Guidelines](#testing-guidelines)
6. [Commit Messages](#commit-messages)
7. [Pull Request Process](#pull-request-process)
8. [Review Process](#review-process)

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for everyone, regardless of:
- Age, body size, disability, ethnicity
- Gender identity and expression
- Level of experience
- Nationality, personal appearance
- Race, religion, or sexual identity

### Our Standards

**Positive behavior:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards others

**Unacceptable behavior:**
- Harassment of any kind
- Trolling, insulting/derogatory comments
- Public or private harassment
- Publishing others' private information
- Other conduct which could reasonably be considered inappropriate

### Enforcement

Violations can be reported to: conduct@sca-platform.local

---

## Getting Started

### Prerequisites

```bash
# Required
Python 3.10+
Node.js 18+
Docker & Docker Compose
Git

# Recommended
VS Code with extensions:
- Python
- ESLint
- Prettier
- GitLens
```

### Setup Development Environment

1. **Fork the repository**
   ```bash
   # Click "Fork" on GitHub
   git clone https://github.com/YOUR_USERNAME/SCA.git
   cd SCA
   ```

2. **Add upstream remote**
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/SCA.git
   ```

3. **Install dependencies**
   ```bash
   python scripts/dev.py install
   ```

4. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your local settings
   ```

5. **Start services**
   ```bash
   # Option A: Docker
   python scripts/dev.py docker-up
   
   # Option B: Local
   # Terminal 1: Backend
   cd backend && uvicorn main:app --reload
   
   # Terminal 2: Frontend
   cd frontend && npm run dev
   ```

6. **Verify setup**
   ```bash
   # Run tests
   python scripts/dev.py test
   
   # Check linting
   python scripts/dev.py lint
   ```

---

## Development Workflow

### 1. Choose an Issue

- Browse [open issues](https://github.com/OWNER/SCA/issues)
- Look for labels: `good first issue`, `help wanted`
- Comment on issue to claim it
- Wait for maintainer approval before starting

### 2. Create a Branch

```bash
# Update main
git checkout main
git pull upstream main

# Create feature branch
git checkout -b phase1/feature-name
# or
git checkout -b bugfix/issue-123
# or
git checkout -b hotfix/security-issue
```

**Branch naming:**
- `phase1/feature-name` - Phase 1 features
- `phase2/feature-name` - Phase 2 features
- `bugfix/issue-123` - Bug fixes
- `hotfix/critical-fix` - Urgent fixes
- `docs/update-readme` - Documentation

### 3. Make Changes

- Follow [coding standards](#coding-standards)
- Write tests for new code
- Update documentation
- Keep commits atomic and focused

### 4. Test Your Changes

```bash
# Run all tests
python scripts/dev.py test

# Run with coverage
python scripts/dev.py test-cov

# Run linters
python scripts/dev.py lint

# Format code
python scripts/dev.py format

# Security check
python scripts/dev.py security-check
```

### 5. Commit Changes

```bash
# Stage changes
git add .

# Commit with clear message
git commit -m "[Phase 1] Add JWT authentication

- Implement User model with password hashing
- Add login/register endpoints
- Create JWT token utilities
- Add authentication middleware

Closes #123"
```

See [Commit Messages](#commit-messages) for format.

### 6. Push and Create PR

```bash
# Push to your fork
git push origin phase1/feature-name

# Create Pull Request on GitHub
# Fill in the PR template
```

---

## Coding Standards

### Python (Backend)

**Style Guide:**
- Follow [PEP 8](https://pep8.org/)
- Use [Black](https://black.readthedocs.io/) for formatting
- Use [isort](https://pycqa.github.io/isort/) for import sorting
- Use [ruff](https://docs.astral.sh/ruff/) for linting

**Best Practices:**
```python
# Type hints
def create_user(email: str, password: str) -> User:
    """Create a new user."""
    pass

# Docstrings (Google style)
def complex_function(param1: str, param2: int) -> dict:
    """
    Brief description.
    
    Args:
        param1: Description of param1
        param2: Description of param2
        
    Returns:
        Dictionary containing result
        
    Raises:
        ValueError: If param2 is negative
    """
    pass

# Use Pydantic for validation
from pydantic import BaseModel, field_validator

class UserCreate(BaseModel):
    email: str
    password: str
    
    @field_validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        return v

# Async/await properly
async def get_user(db: AsyncSession, user_id: str) -> User:
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    return result.scalar_one_or_none()

# Error handling
from core.exceptions import UserNotFoundError

if not user:
    raise UserNotFoundError(user_id)
```

**Avoid:**
- Global variables
- Mutable default arguments
- `import *`
- Bare except clauses
- Magic numbers (use constants)

### TypeScript (Frontend)

**Style Guide:**
- Follow [TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- Use [ESLint](https://eslint.org/) for linting
- Use [Prettier](https://prettier.io/) for formatting

**Best Practices:**
```typescript
// Interfaces for type safety
interface User {
  id: string;
  email: string;
  username: string;
}

// Props with types
interface UserCardProps {
  user: User;
  onEdit: (user: User) => void;
}

// Functional components with types
const UserCard: React.FC<UserCardProps> = ({ user, onEdit }) => {
  return <div>...</div>;
};

// Hooks with types
const [users, setUsers] = useState<User[]>([]);

// API calls with error handling
const fetchUsers = async (): Promise<User[]> => {
  try {
    const response = await api.get<User[]>('/users');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch users:', error);
    throw error;
  }
};

// Use React Query for data fetching
const { data: users, isLoading, error } = useQuery({
  queryKey: ['users'],
  queryFn: fetchUsers,
});
```

**Avoid:**
- `any` type (use `unknown` if needed)
- Non-null assertion operator (!)
- Ignoring TypeScript errors
- Inline styles (use Tailwind classes)
- Large component files (split into smaller components)

---

## Testing Guidelines

### Unit Tests (Backend)

```python
# tests/test_services/test_scan_service.py
import pytest
from services.scan_service import ScanService

@pytest.fixture
def scan_service():
    return ScanService()

def test_detect_languages_python(scan_service, tmp_path):
    # Arrange
    (tmp_path / "main.py").touch()
    (tmp_path / "test.py").touch()
    
    # Act
    languages = scan_service.detect_languages(str(tmp_path))
    
    # Assert
    assert "python" in languages

@pytest.mark.asyncio
async def test_create_scan(db_session, test_project):
    # Arrange
    scan_data = {...}
    
    # Act
    scan = await create_scan(db_session, scan_data)
    
    # Assert
    assert scan.status == ScanStatus.PENDING
    assert scan.project_id == test_project.id
```

### Integration Tests (Backend)

```python
# tests/integration/test_auth_api.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    # Arrange
    user_data = {"username": "testuser", "password": "Test123!"}
    
    # Act
    response = await client.post("/api/auth/login", json=user_data)
    
    # Assert
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

@pytest.mark.asyncio
async def test_protected_endpoint_without_token(client: AsyncClient):
    # Act
    response = await client.get("/api/projects")
    
    # Assert
    assert response.status_code == 401
```

### E2E Tests (Frontend)

```typescript
// e2e/login.spec.ts
import { test, expect } from '@playwright/test';

test('user can login successfully', async ({ page }) => {
  // Navigate to login page
  await page.goto('http://localhost:3000/login');
  
  // Fill in credentials
  await page.fill('[name="username"]', 'testuser');
  await page.fill('[name="password"]', 'Test123!');
  
  // Click login button
  await page.click('button[type="submit"]');
  
  // Verify redirect to dashboard
  await expect(page).toHaveURL('http://localhost:3000/');
  
  // Verify user menu is visible
  await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
});
```

### Test Coverage Requirements

- Unit tests: 80%+ coverage
- Integration tests: All critical paths
- E2E tests: Core user workflows
- New features: Must include tests
- Bug fixes: Must include regression test

---

## Commit Messages

### Format

```
[Phase X] Brief description (50 chars max)

Detailed explanation of what changed and why.
Wrap at 72 characters per line.

- Bullet points for multiple changes
- Use present tense ("Add feature" not "Added feature")
- Use imperative mood ("Fix bug" not "Fixes bug")

Closes #123
Refs #456
```

### Examples

**Good:**
```
[Phase 1] Add JWT authentication system

- Implement User model with password hashing
- Add login/register endpoints
- Create JWT token utilities
- Add authentication middleware

Closes #123
```

```
[Bugfix] Fix scanner timeout not being respected

Scanner processes were not being terminated when
timeout was reached, causing zombie processes.

- Add proper process termination in scanner_utils
- Set timeout signal handler
- Clean up zombie processes on worker shutdown

Fixes #234
```

**Bad:**
```
updated stuff
```

```
Fixed bug
```

```
WIP
```

### Types

- `[Phase X]` - Feature for specific phase
- `[Bugfix]` - Bug fix
- `[Hotfix]` - Urgent production fix
- `[Docs]` - Documentation only
- `[Refactor]` - Code refactoring
- `[Test]` - Adding tests
- `[Chore]` - Maintenance tasks

---

## Pull Request Process

### Before Creating PR

- [ ] All tests pass locally
- [ ] Code is formatted and linted
- [ ] Documentation is updated
- [ ] Changelog is updated (if needed)
- [ ] Commits are clean and descriptive
- [ ] Branch is up to date with main

### PR Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Related Issues
Closes #123
Refs #456

## How Has This Been Tested?
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E tests
- [ ] Manual testing

**Test Configuration:**
- OS: Windows 11
- Python: 3.11
- Node: 18.16

## Checklist
- [ ] My code follows the style guidelines
- [ ] I have performed a self-review
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix/feature works
- [ ] New and existing unit tests pass locally
- [ ] Any dependent changes have been merged

## Screenshots (if applicable)
[Add screenshots here]

## Additional Notes
[Any additional information]
```

### PR Size Guidelines

- **Small (< 200 lines):** Ideal, quick to review
- **Medium (200-500 lines):** Acceptable
- **Large (500+ lines):** Consider splitting

If PR is large, explain why in description.

---

## Review Process

### For Authors

- **Respond to feedback:** Within 48 hours
- **Be open to suggestions:** Reviewers want to help
- **Ask questions:** If feedback is unclear
- **Make requested changes:** Or explain why not
- **Keep it professional:** Focus on code, not personal

### For Reviewers

- **Be respectful:** Constructive criticism only
- **Be specific:** Point to exact lines
- **Explain reasoning:** Help author learn
- **Approve if satisfied:** Don't nitpick
- **Test locally:** For complex changes

### Review Checklist

- [ ] Code follows style guidelines
- [ ] Changes are well-documented
- [ ] Tests are included and pass
- [ ] No security vulnerabilities introduced
- [ ] Performance impact is acceptable
- [ ] Error handling is proper
- [ ] Code is maintainable
- [ ] Backwards compatibility maintained (or documented)

### Merge Criteria

A PR can be merged when:
1. At least 1 approval from maintainer
2. All tests pass (CI green)
3. No merge conflicts
4. All review comments resolved
5. Documentation updated
6. Changelog updated (if needed)

---

## Recognition

Contributors will be recognized in:
- [CONTRIBUTORS.md](CONTRIBUTORS.md)
- Release notes
- Project README

Top contributors may receive:
- Commit access
- Maintainer status
- Acknowledgment in presentations

---

## Questions?

- **General questions:** discussions@sca-platform.local
- **Bug reports:** Create GitHub issue
- **Security:** security@sca-platform.local
- **Code of conduct:** conduct@sca-platform.local

---

**Thank you for contributing to SCA Platform! 🚀**

*Last Updated: 2026-07-31*
