"""Telegram notifications utility."""

import logging
import httpx
from config import settings
from core.retry import retry_external_api

logger = logging.getLogger(__name__)


@retry_external_api
def _post_telegram_api(url: str, **kwargs) -> dict:
    """Helper to make POST requests with retry logic."""
    timeout = kwargs.pop('timeout', 10.0)
    with httpx.Client(timeout=timeout) as client:
        response = client.post(url, **kwargs)
        response.raise_for_status()
        return response.json()



def escape_html(text: str) -> str:
    """
    Escape special characters for Telegram HTML parse mode.
    """
    if not text:
        return ""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def create_telegram_topic(project_name: str) -> int | None:
    """
    Create a forum topic on Telegram.
    Returns the message_thread_id if successful, or None.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID

    if not token or not chat_id:
        return None

    url = f"https://api.telegram.org/bot{token}/createForumTopic"
    payload = {
        "chat_id": chat_id,
        "name": project_name
    }

    try:
        data = _post_telegram_api(url, json=payload)
        if data.get("ok"):
            thread_id = data["result"]["message_thread_id"]
            logger.info(f"Created Telegram topic '{project_name}' with thread ID {thread_id}")
            return thread_id
    except Exception as e:
        logger.error(f"Failed to create Telegram forum topic: {e}")
    return None


def send_telegram_notification(
    message: str,
    message_thread_id: int | None = None,
    inline_keyboard: list | None = None
) -> int | None:
    """
    Send a message to the configured Telegram chat.
    Uses HTML parse mode.

    Args:
        message: The message body (HTML formatted)
        message_thread_id: Optional thread ID (for forum topics)
        inline_keyboard: Optional list of inline keyboard buttons

    Returns:
        int | None: The sent message_id if successful, or None
    """
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID

    if not token or not chat_id:
        logger.warning("Telegram notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured.")
        return None

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    if message_thread_id is not None:
        payload["message_thread_id"] = message_thread_id

    if inline_keyboard:
        payload["reply_markup"] = {"inline_keyboard": inline_keyboard}

    try:
        data = _post_telegram_api(url, json=payload)
        if data.get("ok"):
            message_id = data["result"]["message_id"]
            logger.info(f"Telegram notification sent successfully. Message ID: {message_id}")
            return message_id
    except Exception as e:
        logger.error(f"Failed to send Telegram notification: {e}")
    return None


def pin_telegram_message(message_id: int) -> bool:
    """
    Pin a message in the configured Telegram chat.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID

    if not token or not chat_id:
        return False

    url = f"https://api.telegram.org/bot{token}/pinChatMessage"
    payload = {
        "chat_id": chat_id,
        "message_id": message_id,
        "disable_notification": True
    }
    try:
        _post_telegram_api(url, json=payload)
        logger.info(f"Pinned message {message_id} in Telegram.")
        return True
    except Exception as e:
        logger.error(f"Failed to pin Telegram message {message_id}: {e}")
        return False


def unpin_telegram_message(message_id: int) -> bool:
    """
    Unpin a message in the configured Telegram chat.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID

    if not token or not chat_id:
        return False

    url = f"https://api.telegram.org/bot{token}/unpinChatMessage"
    payload = {
        "chat_id": chat_id,
        "message_id": message_id
    }
    try:
        _post_telegram_api(url, json=payload)
        logger.info(f"Unpinned message {message_id} in Telegram.")
        return True
    except Exception as e:
        logger.error(f"Failed to unpin Telegram message {message_id}: {e}")
        return False


def delete_telegram_topic(message_thread_id: int) -> bool:
    """
    Delete a forum topic on Telegram.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID

    if not token or not chat_id:
        return False

    url = f"https://api.telegram.org/bot{token}/deleteForumTopic"
    payload = {
        "chat_id": chat_id,
        "message_thread_id": message_thread_id
    }
    try:
        _post_telegram_api(url, json=payload)
        logger.info(f"Deleted Telegram forum topic {message_thread_id}.")
        return True
    except Exception as e:
        logger.error(f"Failed to delete Telegram forum topic {message_thread_id}: {e}")
        return False


def send_telegram_document(
    file_path: str,
    caption: str,
    message_thread_id: int | None = None
) -> int | None:
    """
    Send a document file to the configured Telegram chat.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID

    if not token or not chat_id:
        logger.warning("Telegram document send skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured.")
        return None

    url = f"https://api.telegram.org/bot{token}/sendDocument"
    data = {
        "chat_id": chat_id,
        "caption": caption,
        "parse_mode": "HTML"
    }
    if message_thread_id is not None:
        data["message_thread_id"] = message_thread_id

    try:
        from pathlib import Path
        p = Path(file_path)
        if not p.exists():
            logger.error(f"Telegram document send failed: File {file_path} does not exist.")
            return None

        with open(p, "rb") as f:
            files = {"document": (p.name, f, "text/html")}
            result = _post_telegram_api(url, data=data, files=files, timeout=30.0)
            if result.get("ok"):
                message_id = result["result"]["message_id"]
                logger.info(f"Telegram document sent successfully. Message ID: {message_id}")
                return message_id
    except Exception as e:
        logger.error(f"Failed to send Telegram document: {e}")
    return None
