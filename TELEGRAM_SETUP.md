# Telegram Integration Guide

## Overview
The SCA Platform now supports **bidirectional Telegram integration**:
1. **Receive notifications** - Automatic PDF reports after scan completion
2. **Send scan requests** - Trigger scans directly from Telegram using bot commands

## Features
- 🔔 Automatic notifications after scan completion
- 📄 PDF reports sent directly to Telegram
- 📊 Scan statistics in message caption
- ⚙️ Easy configuration through Settings page
- 🤖 **NEW:** Trigger scans from Telegram bot commands
- 💬 **NEW:** Check scan status via Telegram
- 🚀 **NEW:** Remote security scanning from any device

## Setup Instructions

### Step 1: Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` command
3. Follow the instructions to create your bot
4. Copy the **Bot Token** (looks like: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

### Step 2: Get Your Chat ID

#### For Group Chat:
1. Add your bot to your group chat
2. Make sure the bot has permission to send messages
3. Send a message in the group
4. Use [@userinfobot](https://t.me/userinfobot) or [@getidsbot](https://t.me/getidsbot) to get your group chat ID
5. The Chat ID will look like: `-1001234567890` (negative number for groups)

#### For Private Chat:
1. Start a conversation with your bot
2. Use [@userinfobot](https://t.me/userinfobot) to get your personal Chat ID
3. The Chat ID will be a positive number

### Step 3: Configure in SCA Platform

1. Navigate to **Settings** page in the SCA Platform
2. Enter your **Bot Token**
3. Enter your **Chat ID**
4. Click **Test Connection** to verify the setup
5. Enable **Telegram Notifications** toggle
6. Click **Save Configuration**

### Step 4: Run a Scan

1. Go to **New Scan** page
2. Configure and run a scan
3. After the scan completes, a PDF report will be automatically sent to your Telegram chat

## Message Format

The Telegram message will include:
- 🔒 Security Scan Report header
- 📁 Project name
- 📅 Scan date and time
- 📊 Total findings count
- ⚠️ Critical findings count
- 🔴 High severity findings count
- 🟡 Medium severity findings count
- 📎 PDF report attachment

## Troubleshooting

### Bot Token Invalid
- Make sure you copied the entire token from BotFather
- Check for extra spaces or characters

### Chat ID Not Working
- For groups, make sure the Chat ID is negative (starts with `-`)
- Verify the bot is added to the group
- Make sure the bot has permission to send messages

### PDF Not Sending
- Check your internet connection
- Verify the bot token and chat ID are correct
- Check the browser console for error messages

### Connection Test Failed
- Verify both Bot Token and Chat ID are correct
- Make sure the bot is not blocked
- Check if the bot has been removed from the group

## Security Notes

- ⚠️ **Never share your Bot Token publicly**
- 🔒 Bot Token is stored locally in `.sca-data/telegram-config.json`
- 🛡️ The Settings page only shows the last 8 characters of your token for security

## Disabling Notifications

To disable automatic Telegram notifications:
1. Go to **Settings** page
2. Toggle off **Enable Telegram Notifications**
3. Click **Save Configuration**

Your configuration will be preserved, so you can re-enable it anytime.

## Manual Send

You can also manually send a scan report to Telegram:
1. Go to **History** page
2. Click on a completed scan
3. Click the **Send to Telegram** button (if available)

---

**Need Help?** Check the [Telegram Bot API Documentation](https://core.telegram.org/bots/api) for more information.

---

## 🤖 Using Bot Commands (NEW)

You can now trigger security scans directly from Telegram without opening the SCA Platform web interface!

### Setting Up Webhook

To enable bot commands, you need to set up a webhook so Telegram can send commands to your SCA Platform:

1. **Deploy your SCA Platform** to a server with a public URL (e.g., `https://your-domain.com`)
2. **Set the webhook** by sending this request (replace with your bot token and URL):

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/api/telegram/webhook"}'
```

3. **Verify webhook** is set:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

### Local Development (Optional)

For local testing, you can use **ngrok** to expose your local server:

1. Install ngrok: https://ngrok.com/download
2. Run your SCA Platform: `npm run dev`
3. In another terminal, run: `ngrok http 3000`
4. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
5. Set webhook to: `https://abc123.ngrok.io/api/telegram/webhook`

### Available Commands

Once the webhook is configured, you can use these commands in Telegram:

#### `/scan <repo-url>`
Start a security scan on a Git repository.

**Example:**
```
/scan https://github.com/username/my-project.git
```

**Response:**
- Immediately confirms the scan has started
- Provides a scan ID for tracking
- Sends a PDF report when the scan completes

**Supported Git URLs:**
- GitHub: `https://github.com/user/repo.git`
- GitLab: `https://gitlab.com/user/repo.git`
- Bitbucket: `https://bitbucket.org/user/repo.git`
- Any Git URL with `http://`, `https://`, or `git://` protocol

---

#### `/status <scan-id>`
Check the status of a running or completed scan.

**Example:**
```
/status scan-abc123
```

**Response:**
- Scan status (Running, Completed, Failed)
- Project name and scan timestamp
- If completed, shows finding statistics

---

#### `/help`
Display help message with all available commands.

**Example:**
```
/help
```

---

### Usage Examples

**Scenario 1: Quick Scan from Mobile**
```
You: /scan https://github.com/mycompany/api-server.git
Bot: 🚀 Starting security scan...
     📁 Repository: api-server
     ⏳ This may take a few minutes...

Bot: ✅ Scan started successfully!
     🆔 Scan ID: scan-x7k9m2

[After scan completes]
Bot: 🔒 Security Scan Report
     📁 Project: api-server
     📊 Total Findings: 12
     ⚠️ Critical: 2
     🔴 High: 3
     🟡 Medium: 7
     [PDF Report Attached]
```

**Scenario 2: Check Scan Progress**
```
You: /status scan-x7k9m2
Bot: 🔄 Scan Status
     🆔 ID: scan-x7k9m2
     📁 Project: api-server
     📅 Started: 1/6/2026, 2:30 PM
     📊 Status: Running
     ⏳ Scan is still in progress...
```

---

### Tips for Bot Commands

1. **Background Scanning**: Scans triggered from Telegram run in the background. You can close Telegram and the scan will continue.

2. **Notifications**: You'll automatically receive the PDF report in Telegram when the scan completes.

3. **Multiple Scans**: You can trigger multiple scans at once. Each gets a unique scan ID.

4. **Private vs Group Chats**: 
   - Works in both private chats with the bot and group chats
   - In groups, reports are sent to the group
   - Use forum topics to organize reports by project

5. **Security**: Only users who have the bot token can trigger scans. Keep your token secure!

---

### Troubleshooting Bot Commands

#### Webhook Not Working
- Verify the webhook URL is correct using `getWebhookInfo`
- Ensure your server has a valid SSL certificate (HTTPS required)
- Check server logs for webhook errors

#### Bot Doesn't Respond to Commands
- Make sure webhook is properly set
- Verify the bot token in Settings is correct
- Check that bot has not been blocked
- Ensure your server is accessible from the internet

#### Scan Fails to Start
- Verify the Git repository URL is accessible
- Check that the repository is public or your server has access credentials
- Review server logs for detailed error messages

#### "Telegram notifications are disabled" Error
- Go to Settings page and enable Telegram notifications
- Save the configuration
- Try the command again

