import sys
import os

# Add backend directory to Python path to import correctly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
# Load environment variables from parent directory .env
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))

from config import settings
from utils.telegram import send_telegram_notification

print("=== TELEGRAM BOT TEST ===")
print(f"TELEGRAM_BOT_TOKEN: {settings.TELEGRAM_BOT_TOKEN}")
print(f"TELEGRAM_CHAT_ID: {settings.TELEGRAM_CHAT_ID}")

if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_CHAT_ID:
    print("CRITICAL ERROR: Telegram settings not loaded. Check your .env file!")
    sys.exit(1)

test_message = (
    "🔔 <b>[SCA Platform] Chạy thử thông báo thành công!</b>\n\n"
    "• Cấu hình Telegram hoạt động chính xác.\n"
    "• Sẵn sàng gửi thông báo tự động khi quét dự án."
)

print("\nSending test message...")
success = send_telegram_notification(test_message)

if success:
    print("SUCCESS: Telegram message sent successfully! Please check your channel/group.")
else:
    print("FAILED: Could not send Telegram message. See logs above.")
