# Telegram Bot - Polling Mode (Cho Private Networks)

## 🔒 Dành cho ai?

**Dùng Polling Mode nếu:**
- ✅ Bạn dùng Tailscale/VPN private network
- ✅ Không muốn expose ra internet công khai
- ✅ Lo lắng về bảo mật
- ✅ Chưa có SSL certificate hoặc domain

**KHÔNG cần:**
- ❌ Webhook URL
- ❌ Ngrok
- ❌ Expose ra internet
- ❌ SSL certificate

## 🆚 Webhook vs Polling

| Feature | Webhook Mode | Polling Mode |
|---------|--------------|--------------|
| Internet Exposure | ✅ Required | ❌ Not needed |
| HTTPS Required | ✅ Yes | ❌ No |
| Security | ⚠️ Exposed | ✅ Private |
| Response Time | ⚡ Instant | 🐌 ~2 seconds |
| Setup Complexity | 🔧 Medium | ✅ Easy |
| Best For | Production servers | Private networks |

## 🚀 Quick Start

### Bước 1: Cấu hình Bot (nếu chưa)

1. Tạo bot với @BotFather
2. Lấy Bot Token
3. Vào Settings page trong SCA Platform
4. Nhập Bot Token
5. Enable Telegram Notifications
6. Save

### Bước 2: Start Polling

```bash
node scripts/start-telegram-polling.js
```

**Hoặc bằng PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/telegram/polling" -Method Post
```

### Bước 3: Test

Mở Telegram và gửi:
```
/help
/scan https://github.com/user/repo.git
```

## 📋 Commands Reference

### Start Polling
```bash
node scripts/start-telegram-polling.js
```

### Stop Polling
```bash
node scripts/stop-telegram-polling.js
```

### Check Status
```bash
curl http://localhost:3000/api/telegram/polling
```

## 🔧 Cách Hoạt Động

```
┌─────────────┐
│  Your Bot   │ (Trong private network)
└──────┬──────┘
       │
       │ 1. Poll every 2 seconds
       │    "Any new messages?"
       │
       ▼
┌──────────────────┐
│ Telegram API     │ (Internet)
│ api.telegram.org │
└──────┬───────────┘
       │
       │ 2. Return updates
       │    "Yes, user sent /scan ..."
       │
       ▼
┌─────────────┐
│  Your Bot   │
└──────┬──────┘
       │
       │ 3. Process command
       │    - Parse /scan
       │    - Trigger scan
       │    - Send response
       │
       ▼
┌──────────────────┐
│ Telegram API     │
└──────┬───────────┘
       │
       │ 4. Deliver to user
       │
       ▼
┌─────────────┐
│  User sees  │
│  "✅ Scan   │
│   started!" │
└─────────────┘
```

## 💡 Advantages

### 🔒 Security
- Không cần expose server ra internet
- Chỉ outgoing connections (an toàn hơn)
- Hoàn hảo cho private networks

### ✅ Simplicity
- Không cần setup webhook URL
- Không cần SSL certificate
- Không cần domain or ngrok
- Chỉ cần Bot Token

### 🌐 Works Anywhere
- Tailscale private network ✅
- VPN ✅
- Behind firewall ✅
- Localhost ✅

## ⚙️ Configuration

### Environment Variables (Optional)

Tạo file `.env.local`:
```env
# Not needed for polling mode!
# Polling uses localhost by default
```

### Adjust Polling Interval

Trong code `src/lib/telegram-polling.ts`, tìm dòng:
```typescript
export function startTelegramPolling(intervalMs: number = 2000)
```

Thay đổi `2000` (milliseconds) nếu muốn:
- Nhanh hơn: `1000` (1 giây)
- Chậm hơn (tiết kiệm API calls): `5000` (5 giây)

## 🧪 Testing

### Test Locally
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Start polling
node scripts/start-telegram-polling.js

# Terminal 3 (optional): Monitor logs
# Check server terminal for polling messages
```

### Test Commands in Telegram
```
/help
/scan https://github.com/octocat/Hello-World.git
/status scan-xxxxx
```

## 📊 Monitoring

### Check if Polling is Active
```bash
curl http://localhost:3000/api/telegram/polling
```

**Response:**
```json
{
  "active": true,
  "mode": "polling"
}
```

### View Logs

Server terminal sẽ hiển thị:
```
[Telegram Polling] Received update: 123456
[Telegram] Message from User (123): /help
[Telegram] Command: /help, Args: []
```

## 🐛 Troubleshooting

### Polling không start?

**Check 1: Dev server có chạy không?**
```bash
# Should see output if running
curl http://localhost:3000
```

**Check 2: Bot Token đã cấu hình chưa?**
- Vào Settings page
- Kiểm tra Bot Token
- Enable Telegram Notifications

**Check 3: Xem logs**
- Check terminal running `npm run dev`
- Look for `[Telegram Polling]` messages

### Bot không trả lời?

**Check 1: Polling có active không?**
```bash
curl http://localhost:3000/api/telegram/polling
```

**Check 2: Restart polling**
```bash
node scripts/stop-telegram-polling.js
node scripts/start-telegram-polling.js
```

**Check 3: Test với /help**
- Simplest command
- Should always work if config is correct

### Scan không chạy?

**Check:**
- Git URL có hợp lệ?
- Server có quyền truy cập repo?
- Check logs: `logs/worker-*.log`

## 🔄 Auto-Start Polling

Nếu muốn polling tự động start khi dev server chạy, thêm vào `package.json`:

```json
{
  "scripts": {
    "dev": "next dev --webpack",
    "dev:polling": "npm run dev & node scripts/start-telegram-polling.js"
  }
}
```

Sau đó chạy:
```bash
npm run dev:polling
```

## 📝 Notes

1. **Polling tiêu tốn resources hơn webhook một chút** - Nhưng với interval 2 giây, không đáng kể

2. **Response time chậm hơn ~2 giây** - Trade-off cho security

3. **Telegram API có rate limits** - 30 requests/second, polling mode hoàn toàn trong giới hạn

4. **Polling chỉ chạy khi dev server chạy** - Stop server = stop polling

5. **Perfect cho development và private deployments** - Production có thể dùng webhook

## 🎯 Best Practices

1. **Development**: Dùng Polling Mode
2. **Production (Private Network)**: Dùng Polling Mode  
3. **Production (Public Server)**: Có thể dùng Webhook hoặc Polling

## 🆘 Need Help?

1. Check server logs
2. Check `scripts/` folder cho utility scripts
3. Read TELEGRAM_SETUP.md cho webhook alternative
4. Open GitHub issue

---

**Pro Tip**: Polling Mode là giải pháp an toàn nhất cho private networks. Nếu bạn lo lắng về security, đây là lựa chọn đúng đắn! 🔒
