# Telegram Integration Guide

## Overview
The SCA Platform now supports automatic Telegram notifications. After each scan completes, the system can automatically send a PDF report to your Telegram chat group.

## Features
- 🔔 Automatic notifications after scan completion
- 📄 PDF reports sent directly to Telegram
- 📊 Scan statistics in message caption
- ⚙️ Easy configuration through Settings page

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
