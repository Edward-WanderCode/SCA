import sys
import os
import time

# Add backend directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))

from config import settings
from utils.telegram import (
    create_telegram_topic,
    send_telegram_notification,
    pin_telegram_message,
    unpin_telegram_message,
    delete_telegram_topic
)

print("=== TELEGRAM TOPICS AND INTERACTIVE BUTTONS TEST ===")
print(f"BOT_TOKEN: {settings.TELEGRAM_BOT_TOKEN}")
print(f"CHAT_ID: {settings.TELEGRAM_CHAT_ID}")

if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_CHAT_ID:
    print("Error: credentials not found.")
    sys.exit(1)

# 1. Create a Topic
topic_name = "Test Topic SCA " + str(int(time.time()))
print(f"\n1. Creating Forum Topic: '{topic_name}'...")
thread_id = create_telegram_topic(topic_name)

if not thread_id:
    print("FAILED to create topic. Make sure the Telegram group has 'Topics' enabled!")
    sys.exit(1)

print(f"SUCCESS: Topic created with thread ID: {thread_id}")

# 2. Send first scan result to the Topic and Pin it
print("\n2. Sending First message with interactive buttons to topic...")
inline_keyboard = [
    [
        {"text": "🔄 Quét lại (Rescan)", "callback_data": f"rescan:test_id:sast"},
        {"text": "🗑️ Xóa dự án (Delete)", "callback_data": f"delete:test_id"}
    ]
]
msg1 = (
    "🔔 <b>[SCA Platform] Quét lần 1 hoàn thành</b>\n"
    "• Loại: SAST\n"
    "• Trạng thái: Thành công\n"
    "• Số lỗi: 10\n"
    "<i>Tin nhắn này sẽ được ghim, sau đó gỡ ghim khi tin nhắn tiếp theo gửi đến.</i>"
)
msg1_id = send_telegram_notification(msg1, message_thread_id=thread_id, inline_keyboard=inline_keyboard)

if msg1_id:
    print(f"SUCCESS: Sent first message. Message ID: {msg1_id}")
    print("Pinning first message...")
    pin_telegram_message(msg1_id)
else:
    print("FAILED to send first message.")

# 3. Wait 5 seconds
print("\nWaiting 5 seconds before sending second message...")
time.sleep(5)

# 4. Send second scan result, pin it, and unpin first
print("\n3. Sending Second message to topic...")
msg2 = (
    "✅ <b>[SCA Platform] Quét lần 2 hoàn thành</b>\n"
    "• Loại: SAST\n"
    "• Trạng thái: Thành công\n"
    "• Số lỗi: 5 (Giảm 5 lỗi)\n"
    "<i>Tin nhắn này sẽ được ghim mới, tin nhắn cũ sẽ được gỡ ghim.</i>"
)
msg2_id = send_telegram_notification(msg2, message_thread_id=thread_id, inline_keyboard=inline_keyboard)

if msg2_id:
    print(f"SUCCESS: Sent second message. Message ID: {msg2_id}")
    print("Pinning second message...")
    pin_telegram_message(msg2_id)
    
    if msg1_id:
        print("Unpinning first message...")
        unpin_telegram_message(msg1_id)
else:
    print("FAILED to send second message.")

# 5. Wait 10 seconds (giving the user time to view it)
print("\nWaiting 10 seconds before cleaning up/deleting topic...")
time.sleep(10)

# 6. Delete Topic
print("\n4. Deleting Forum Topic...")
success = delete_telegram_topic(thread_id)
if success:
    print("SUCCESS: Topic deleted successfully!")
else:
    print("FAILED to delete topic.")

print("\n=== TEST COMPLETED ===")
