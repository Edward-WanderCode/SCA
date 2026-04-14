# Contributing to SCA — Static Code Analyzer

🇻🇳 [Phiên bản tiếng Việt](CONTRIBUTING.vi.md)

Thank you for your interest in contributing to SCA! 🎉  
All contributions are greatly appreciated — from bug reports, feature suggestions, to writing code.

## 📋 Contribution Workflow

### 1. Fork & Clone

```bash
# Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/SCA.git
cd SCA
```

### 2. Set Up Environment

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Create database and generate Prisma client
npx prisma migrate dev
npx prisma generate

# Download scan engines (Windows)
npm run setup

# Start development server
npm run dev
```

### 3. Create a New Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 4. Code & Test

- Follow the project's coding standards
- Ensure `npm run lint` passes without errors
- Ensure `npm run build` succeeds

### 5. Commit & Push

```bash
git add .
git commit -m "feat: brief description of changes"
git push origin feature/your-feature-name
```

### 6. Create a Pull Request

- Open a Pull Request on GitHub
- Clearly describe your changes
- Link to related Issues (if applicable)

## 📌 Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Description |
|--------|-------------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation update |
| `style:` | Code formatting (no logic changes) |
| `refactor:` | Code restructuring |
| `test:` | Add/modify tests |
| `chore:` | Build, config, or dependency updates |

## 🏗️ Project Structure

```
SCA/
├── src/
│   ├── app/          # Next.js App Router pages & API routes
│   ├── components/   # Reusable React components
│   └── lib/          # Utilities, helpers, Prisma client
├── prisma/           # Database schema & migrations
├── scripts/          # PowerShell scripts (setup, rules update)
├── OpenGrep/         # Semgrep/OpenGrep engine (auto-downloaded)
├── Trivy/            # Trivy vulnerability scanner (auto-downloaded)
└── TruffleHog/       # Secret scanner (auto-downloaded)
```

## 🐛 Bug Reports

When reporting a bug, please include:

1. **Environment**: OS, Node.js version, browser
2. **Steps to reproduce**: Detailed step-by-step description
3. **Expected result** vs **Actual result**
4. **Screenshots** (if UI-related)
5. **Error logs** (from console or terminal)

## 💡 Feature Requests

- Open an Issue with the `enhancement` label
- Describe the use case and why the feature is needed
- If possible, provide mockups or examples

## 🔒 Security

If you discover a security vulnerability, **DO NOT** report it via a public Issue.  
See [SECURITY.md](SECURITY.md) for responsible disclosure guidelines.

## 📜 License

By contributing, you agree that your code will be licensed under the [MIT License](LICENSE).

---

Thank you for contributing! 🚀
