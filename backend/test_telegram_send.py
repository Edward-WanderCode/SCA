import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import logging
logging.basicConfig(level=logging.INFO)

from utils.telegram import send_telegram_notification

print("Testing send_telegram_notification...")
res = send_telegram_notification(
    message="🧪 <b>Test message:</b> SCA platform bot connectivity check.",
    message_thread_id=306
)
print(f"Result: {res}")
