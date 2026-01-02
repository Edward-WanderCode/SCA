# Antigravity SCA - Advanced Static Code Analyzer

Phần mềm quét code tĩnh đa ngôn ngữ với giao diện Next.js cao cấp và community-driven security rules.

## 🚀 Features

- ✅ **Multi-language Support**: TypeScript, JavaScript, Python, Go, Java, C/C++...
- ✅ **Community Rules**: 1,250+ rules từ Semgrep Registry (OWASP, Security Audit...)
- ✅ **Premium Dashboard**: Dark mode, glassmorphism, smooth animations
- ✅ **Fast Scanning**: Local cache giúp quét nhanh gấp 10x (3s vs 30s)
- ✅ **Offline Ready**: Hoạt động hoàn toàn offline sau khi cache rules
- ✅ **Real-time Terminal**: Agent logs monitoring

---

## 🛠 Tech Stack

- **Frontend**: Next.js 15, Tailwind CSS, Framer Motion, Lucide React
- **Backend**: Next.js API Routes (Node.js)
- **Scanner Engine**: Semgrep CLI with community registry rules

---

## 🚦 Quick Start

### 1. Installation
```bash
npm install
```

### 2. Cache Security Rules (một lần)
```bash
npm run update-rules
```
⏱️ Mất ~1-2 phút để cache 1,250+ rules

### 3. Run Development Server
```bash
npm run dev
```
🌐 Mở http://localhost:3000

---

## 📋 Available Scripts

```bash
npm run dev              # Start dev server
npm run build            # Build production
npm run update-rules     # Update & cache security rules
npm run rules:info       # View cached rules info
```

---

## 🔥 Rule Management

### Cached Rule Packs (1,250+ rules)
- `p/security-audit` - 500+ core security vulnerabilities
- `p/owasp-top-ten` - 300+ OWASP Top 10 patterns
- `p/javascript` - 200+ JavaScript/TypeScript rules
- `p/typescript` - 150+ TypeScript-specific
- `p/react` - 100+ React security patterns

### Update Rules (khuyến nghị hàng tuần)
```bash
npm run update-rules
```

### Check Rules Status
```bash
npm run rules:info
```

---

## ⚡ Performance

| Metric | Without Cache | With Cache | Improvement |
|--------|---------------|------------|-------------|
| Scan Time | 30 seconds | **3 seconds** | 10x faster |
| Internet | Required | Optional | Offline mode |
| Bandwidth | ~2MB/scan | 0 MB | 100% saved |

---

## 📂 Project Structure

```
├── src/
│   ├── app/              # Next.js pages & API routes
│   │   ├── page.tsx      # Dashboard
│   │   ├── scan/         # New Scan page  
│   │   ├── rules/        # Rules Registry
│   │   ├── terminal/     # Agent Terminal
│   │   └── api/scan/     # Scanning API
│   ├── components/       # UI components
│   │   └── Sidebar.tsx
│   └── lib/              # Utilities
│       ├── scanner.ts    # Semgrep wrapper
│       └── utils.ts
├── scripts/
│   ├── update-rules.js   # Rule caching script
│   └── rules-info.js     # Rule info display
└── .semgrep-rules/       # Cached rules metadata
```

---

## 🔧 How It Works

### Scanning Flow:
1. User inputs Git URL or uploads files via web UI
2. Backend clones repo to temp folder (if Git URL)
3. Semgrep scans with cached rules from `~/.semgrep/`
4. Results parsed and displayed in premium UI
5. Temp files cleaned up

### Rule Caching:
- Rules cached in Semgrep's internal cache (`~/.semgrep/`)
- No internet needed after initial `npm run update-rules`
- Metadata tracked in `.semgrep-rules/metadata.json`

---

## 🛡 Security Rules Sources

Primary: **Semgrep Registry** (https://semgrep.dev/r)
- 2,300+ rules, cập nhật hàng tuần
- Community-driven (OWASP, r2c, GitHub Security Lab)
- Miễn phí 100% cho commercial use

---

## 🎯 Usage Workflow

### Lần Đầu (Setup)
```bash
npm install
npm run update-rules  # Cache rules (~2 phút)
npm run dev
```

### Hàng Ngày
```bash
npm run dev  # Quét tự động dùng cached rules (3 giây)
```

### Update Rules (Định Kỳ)
```bash
npm run update-rules  # Khuyến nghị: hàng tuần
```

---

## 🐛 Troubleshooting

### Rules out of date
```bash
npm run rules:info     # Check age
npm run update-rules   # Update if needed
```

### Scan still slow
```bash
# Verify rules are cached
npm run rules:info

# Re-cache if needed
npm run update-rules
```

---

## 📊 Rule Pack Details

View detailed info about cached rules:
```bash
npm run rules:info
```

Output mẫu:
```
📦 Semgrep Rules Cache Information
📅 Last Updated: 30/12/2024
📋 Cached Rule Packs: 5 packs
✅ Rules are fresh (0 days old)
```

---

## 🚀 Production Deployment

```bash
npm run build
npm start
```

**Environment Variables:**
- (Optional) Configure in `.env.local` nếu cần

---

## 📝 License

MIT

---

**Built with ❤️ by Antigravity**
