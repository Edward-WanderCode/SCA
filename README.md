<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Prisma-6-2D3748?style=for-the-badge&logo=prisma" alt="Prisma" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
</p>

# 🛡️ SCA — Static Code Analyzer

> **A comprehensive, self-hosted static code analysis platform** that combines SAST scanning, vulnerability detection, and secret leak prevention into a single, beautiful dashboard.

🇻🇳 [Phiên bản tiếng Việt](README.vi.md)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔍 **SAST Scanning** | Powered by OpenGrep (Semgrep-compatible) with 2,000+ community rules |
| 🛡️ **Vulnerability Detection** | Trivy integration for CVE scanning across dependencies and containers |
| 🔑 **Secret Detection** | TruffleHog-based scanning for API keys, tokens, and credentials |
| 🧹 **Linter Integration** | Built-in support for Ruff, ESLint, and GolangCI-Lint |
| 📊 **SARIF Export** | Standardized output compatible with GitHub Security, VS Code, and more |
| 📄 **PDF Reports** | Professional, export-ready vulnerability reports |
| 🤖 **Telegram Bot** | Remote scanning and notifications via Telegram |
| 🌲 **File Tree View** | Interactive source tree with inline finding annotations |
| 📈 **Dashboard** | Real-time security health score and scan analytics |
| 🔄 **Incremental Scans** | Compare results across scans to track remediation progress |

## 🏗️ Architecture

```
SCA/
├── src/
│   ├── app/              # Next.js App Router (pages & API routes)
│   │   ├── api/          # REST API endpoints
│   │   │   ├── scan/     # Scan orchestration
│   │   │   ├── history/  # Scan history management
│   │   │   ├── telegram/ # Telegram bot webhooks
│   │   │   └── upload/   # File upload handling
│   │   ├── scan/         # New Scan page
│   │   ├── results/      # Scan results viewer
│   │   ├── history/      # Scan history page
│   │   ├── rules/        # Rule registry browser
│   │   ├── vulnerabilities/ # Vulnerability explorer
│   │   ├── terminal/     # Agent terminal
│   │   └── settings/     # Application settings
│   ├── components/       # Reusable React components
│   └── lib/              # Core logic
│       ├── scanner.ts    # Scan engine orchestrator
│       ├── linter.ts     # Multi-language linter runner
│       ├── sarif.ts      # SARIF format converter
│       ├── telegram.ts   # Telegram bot integration
│       └── pdf-export.ts # PDF report generator
├── prisma/               # Database schema & migrations (SQLite)
├── scripts/              # Setup & maintenance scripts
├── OpenGrep/             # SAST engine (auto-downloaded)
├── Trivy/                # Vulnerability scanner (auto-downloaded)
└── TruffleHog/           # Secret scanner (auto-downloaded)
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 20.x
- **Windows** 10/11 (scan engines are Windows binaries)
- **Git**

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Edward-WanderCode/SCA.git
cd SCA

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env with your configuration

# 4. Initialize database
npx prisma migrate dev
npx prisma generate

# 5. Download scan engines (OpenGrep, Trivy, TruffleHog)
npm run setup

# 6. Start development server
npm run dev
```

The application will be available at **http://localhost:3000**.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run setup` | Download scan engine binaries |
| `npm run update-rules` | Update OpenGrep security rules |
| `npm run cleanup-temp` | Clean up temporary scan files |

## 🔧 Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | No | SQLite database path (default: `file:./prisma/dev.db`) |
| `NEXTAUTH_SECRET` | Yes | Secret key for NextAuth.js session encryption |
| `NEXTAUTH_URL` | Yes | Application URL (default: `http://localhost:3000`) |
| `TELEGRAM_BOT_TOKEN` | No | Telegram Bot API token for remote scanning |
| `TELEGRAM_CHAT_ID` | No | Telegram chat ID for notifications |

### Scan Sources

SCA supports multiple scan input methods:

- **📁 Local Directory** — Browse and select folders on the server
- **📤 File Upload** — Upload source code archives (ZIP, TAR.GZ)
- **🔗 Git URL** — Clone and scan remote repositories
- **🤖 Telegram** — Send files or repos via Telegram bot

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

- 🐛 [Report a bug](https://github.com/Edward-WanderCode/SCA/issues/new?template=bug_report.md)
- 💡 [Request a feature](https://github.com/Edward-WanderCode/SCA/issues/new?template=feature_request.md)
- 🔒 [Report a security vulnerability](SECURITY.md)

## 📜 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Edward-WanderCode">Edward-WanderCode</a>
</p>
