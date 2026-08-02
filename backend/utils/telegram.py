"""Telegram notifications utility."""

import logging
import httpx
from config import settings
from core.retry import retry_external_api

logger = logging.getLogger(__name__)


@retry_external_api
def _post_telegram_api(url: str, **kwargs) -> dict:
    """Helper to make POST requests with retry logic and fallback to official API if local server is unreachable."""
    timeout = kwargs.pop('timeout', 10.0)
    with httpx.Client(timeout=timeout) as client:
        try:
            response = client.post(url, **kwargs)
            response.raise_for_status()
            return response.json()
        except (httpx.ConnectError, httpx.TimeoutException, httpx.RequestError) as err:
            base_url = get_telegram_api_base_url()
            if "telegram-bot-api" in url or "localhost" in url or "127.0.0.1" in url:
                alt_url = url.replace(base_url, "https://api.telegram.org")
                if alt_url != url:
                    logger.warning(f"Local Telegram API ({url}) unreachable ({err}). Fallback to {alt_url}")
                    response = client.post(alt_url, **kwargs)
                    response.raise_for_status()
                    return response.json()
            raise


def get_telegram_api_base_url() -> str:
    """Return the configured base URL for Telegram Bot API (defaults to https://api.telegram.org or local server)."""
    base = getattr(settings, 'TELEGRAM_BOT_API_URL', 'https://api.telegram.org')
    return base.rstrip('/')


def escape_html(text: str) -> str:
    """
    Escape special characters for Telegram HTML parse mode.
    """
    if not text:
        return ""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def get_telegram_credentials() -> tuple[str | None, str | None, int | None]:
    """Get Telegram credentials and default topic thread ID, with cached database lookup."""
    import time

    # Check in-memory cache first (60 second TTL)
    cache = getattr(get_telegram_credentials, '_cache', None)
    cache_time = getattr(get_telegram_credentials, '_cache_time', 0)
    if cache and (time.time() - cache_time) < 60:
        return cache

    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID
    thread_id = getattr(settings, 'TELEGRAM_BOT_COMMAND_THREAD_ID', None)

    try:
        from workers.db import sync_engine
        from sqlalchemy import text
        with sync_engine.connect() as conn:
            result = conn.execute(text("SELECT key, value FROM system_settings"))
            for row in result:
                k, v = row[0], row[1]
                if k == "TELEGRAM_BOT_TOKEN" and v and v.strip():
                    token = v.strip()
                    settings.TELEGRAM_BOT_TOKEN = token
                elif k == "TELEGRAM_CHAT_ID" and v and v.strip():
                    chat_id = v.strip()
                    settings.TELEGRAM_CHAT_ID = chat_id
                elif k == "TELEGRAM_BOT_COMMAND_THREAD_ID" and v and v.strip():
                    try:
                        thread_id = int(v.strip())
                        settings.TELEGRAM_BOT_COMMAND_THREAD_ID = thread_id
                    except ValueError:
                        pass
                elif k == "TELEGRAM_BOT_API_URL" and v and v.strip():
                    settings.TELEGRAM_BOT_API_URL = v.strip()
    except Exception as e:
        logger.debug(f"Failed to load Telegram credentials from DB: {e}")


    # Update cache
    credentials = (token, chat_id, thread_id)
    get_telegram_credentials._cache = credentials
    get_telegram_credentials._cache_time = time.time()

    return credentials


def create_telegram_topic(project_name: str) -> int | None:
    """
    Create a forum topic on Telegram.
    Returns the message_thread_id if successful, or None.
    """
    token, chat_id, _ = get_telegram_credentials()

    if not token or not chat_id:
        return None

    url = f"{get_telegram_api_base_url()}/bot{token}/createForumTopic"
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
    Send a message to the configured Telegram chat/topic.
    Uses HTML parse mode.
    """
    token, chat_id, default_thread_id = get_telegram_credentials()

    if not token or not chat_id:
        logger.warning("Telegram notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured.")
        return None

    target_thread_id = message_thread_id if message_thread_id is not None else default_thread_id

    url = f"{get_telegram_api_base_url()}/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    if target_thread_id is not None:
        payload["message_thread_id"] = target_thread_id

    if inline_keyboard:
        payload["reply_markup"] = {"inline_keyboard": inline_keyboard}

    try:
        data = _post_telegram_api(url, json=payload)
        if data.get("ok"):
            message_id = data["result"]["message_id"]
            logger.info(f"Telegram notification sent successfully to topic {target_thread_id}. Message ID: {message_id}")
            return message_id
    except Exception as e:
        logger.error(f"Failed to send Telegram notification to topic {target_thread_id}: {e}")
    return None


def pin_telegram_message(message_id: int) -> bool:
    """
    Pin a message in the configured Telegram chat.
    """
    token, chat_id, _ = get_telegram_credentials()

    if not token or not chat_id:
        return False

    url = f"{get_telegram_api_base_url()}/bot{token}/pinChatMessage"
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
    token, chat_id, _ = get_telegram_credentials()

    if not token or not chat_id:
        return False

    url = f"{get_telegram_api_base_url()}/bot{token}/unpinChatMessage"
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
    token, chat_id, _ = get_telegram_credentials()

    if not token or not chat_id:
        return False

    url = f"{get_telegram_api_base_url()}/bot{token}/deleteForumTopic"
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
    Send a document file to the configured Telegram chat/topic.
    """
    token, chat_id, default_thread_id = get_telegram_credentials()

    if not token or not chat_id:
        logger.warning("Telegram document send skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured.")
        return None

    target_thread_id = message_thread_id if message_thread_id is not None else default_thread_id

    url = f"{get_telegram_api_base_url()}/bot{token}/sendDocument"
    data = {
        "chat_id": chat_id,
        "caption": caption,
        "parse_mode": "HTML"
    }
    if target_thread_id is not None:
        data["message_thread_id"] = target_thread_id

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
                logger.info(f"Telegram document sent successfully to topic {target_thread_id}. Message ID: {message_id}")
                return message_id
    except Exception as e:
        logger.error(f"Failed to send Telegram document to topic {target_thread_id}: {e}")
    return None
