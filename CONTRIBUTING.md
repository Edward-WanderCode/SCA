# Contributing to SCA - Static Code Analyzer

Cảm ơn bạn đã quan tâm đến việc đóng góp cho SCA! 🎉  
Mọi đóng góp đều được đánh giá cao — từ báo lỗi, đề xuất tính năng, đến viết code.

## 📋 Quy trình đóng góp

### 1. Fork & Clone

```bash
# Fork repo trên GitHub, sau đó clone về máy
git clone https://github.com/<your-username>/SCA.git
cd SCA
```

### 2. Cài đặt môi trường

```bash
# Cài đặt dependencies
npm install

# Copy file environment
cp .env.example .env

# Tạo database và generate Prisma client
npx prisma migrate dev
npx prisma generate

# Tải scan engines (Windows)
npm run setup

# Khởi động development server
npm run dev
```

### 3. Tạo branch mới

```bash
git checkout -b feature/ten-tinh-nang
# hoặc
git checkout -b fix/ten-loi
```

### 4. Code & Test

- Viết code theo chuẩn dự án
- Đảm bảo `npm run lint` không có lỗi
- Đảm bảo `npm run build` thành công

### 5. Commit & Push

```bash
git add .
git commit -m "feat: mô tả ngắn gọn thay đổi"
git push origin feature/ten-tinh-nang
```

### 6. Tạo Pull Request

- Mở Pull Request trên GitHub
- Mô tả rõ ràng thay đổi của bạn
- Liên kết đến Issue liên quan (nếu có)

## 📌 Quy ước Commit

Sử dụng [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Mô tả |
|--------|--------|
| `feat:` | Tính năng mới |
| `fix:` | Sửa lỗi |
| `docs:` | Cập nhật tài liệu |
| `style:` | Format code (không ảnh hưởng logic) |
| `refactor:` | Tái cấu trúc code |
| `test:` | Thêm/sửa test |
| `chore:` | Cập nhật build, config, dependencies |

## 🏗️ Cấu trúc dự án

```
SCA/
├── src/
│   ├── app/          # Next.js App Router pages & API routes
│   ├── components/   # React components tái sử dụng
│   └── lib/          # Utilities, helpers, Prisma client
├── prisma/           # Database schema & migrations
├── scripts/          # PowerShell scripts (setup, rules update)
├── OpenGrep/         # Semgrep/OpenGrep engine (auto-downloaded)
├── Trivy/            # Trivy vulnerability scanner (auto-downloaded)
└── TruffleHog/       # Secret scanner (auto-downloaded)
```

## 🐛 Báo cáo lỗi

Khi báo lỗi, vui lòng cung cấp:

1. **Môi trường**: OS, Node.js version, browser
2. **Các bước tái hiện**: Mô tả chi tiết từng bước
3. **Kết quả mong đợi** vs **Kết quả thực tế**
4. **Screenshots** (nếu liên quan đến UI)
5. **Log lỗi** (từ console hoặc terminal)

## 💡 Đề xuất tính năng

- Mở Issue với tag `enhancement`
- Mô tả rõ use case và lý do tính năng cần thiết
- Nếu có thể, đưa ra mockup hoặc ví dụ

## 🔒 Bảo mật

Nếu bạn phát hiện lỗ hổng bảo mật, **KHÔNG** báo qua Issue công khai.  
Xem [SECURITY.md](SECURITY.md) để biết cách báo cáo an toàn.

## 📜 License

Bằng việc đóng góp, bạn đồng ý rằng code của mình sẽ được cấp phép theo [MIT License](LICENSE).

---

Cảm ơn bạn đã đóng góp! 🚀
