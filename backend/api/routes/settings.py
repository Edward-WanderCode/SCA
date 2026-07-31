"""System Settings API routes."""

import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from db.session import get_db
from models.setting import SystemSetting
from models.user import User
from schemas.setting import (
    SystemSettingsResponse,
    SystemSettingsUpdate,
    TelegramTestPayload,
)
from api.deps import get_current_active_user, require_admin
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


async def sync_settings_to_config(db: AsyncSession):
    """Sync settings stored in database to in-memory config.settings object."""
    result = await db.execute(select(SystemSetting))
    db_settings = {s.key: s.value for s in result.scalars().all()}

    if "TELEGRAM_BOT_TOKEN" in db_settings:
        settings.TELEGRAM_BOT_TOKEN = db_settings["TELEGRAM_BOT_TOKEN"] or None
    if "TELEGRAM_CHAT_ID" in db_settings:
        settings.TELEGRAM_CHAT_ID = db_settings["TELEGRAM_CHAT_ID"] or None
    if "TELEGRAM_BOT_COMMAND_THREAD_ID" in db_settings:
        try:
            val = db_settings["TELEGRAM_BOT_COMMAND_THREAD_ID"]
            settings.TELEGRAM_BOT_COMMAND_THREAD_ID = int(val) if val else 306
        except ValueError:
            pass
    if "OPENGREP_IMAGE" in db_settings and db_settings["OPENGREP_IMAGE"]:
        settings.OPENGREP_IMAGE = db_settings["OPENGREP_IMAGE"]
    if "TRIVY_IMAGE" in db_settings and db_settings["TRIVY_IMAGE"]:
        settings.TRIVY_IMAGE = db_settings["TRIVY_IMAGE"]
    if "TRUFFLEHOG_IMAGE" in db_settings and db_settings["TRUFFLEHOG_IMAGE"]:
        settings.TRUFFLEHOG_IMAGE = db_settings["TRUFFLEHOG_IMAGE"]
    if "MAX_CONCURRENT_SCANS" in db_settings and db_settings["MAX_CONCURRENT_SCANS"]:
        try:
            settings.MAX_CONCURRENT_SCANS = int(db_settings["MAX_CONCURRENT_SCANS"])
        except ValueError:
            pass


@router.get("", response_model=SystemSettingsResponse)
async def get_system_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get current system settings."""
    await sync_settings_to_config(db)

    return SystemSettingsResponse(
        telegram_bot_token=settings.TELEGRAM_BOT_TOKEN,
        telegram_chat_id=settings.TELEGRAM_CHAT_ID,
        telegram_bot_command_thread_id=settings.TELEGRAM_BOT_COMMAND_THREAD_ID,
        opengrep_image=settings.OPENGREP_IMAGE,
        trivy_image=settings.TRIVY_IMAGE,
        trufflehog_image=settings.TRUFFLEHOG_IMAGE,
        max_concurrent_scans=settings.MAX_CONCURRENT_SCANS,
    )


@router.put("", response_model=SystemSettingsResponse)
async def update_system_settings(
    data: SystemSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Update system settings (requires admin)."""
    updates = {}
    if data.telegram_bot_token is not None:
        updates["TELEGRAM_BOT_TOKEN"] = data.telegram_bot_token.strip()
    if data.telegram_chat_id is not None:
        updates["TELEGRAM_CHAT_ID"] = data.telegram_chat_id.strip()
    if data.telegram_bot_command_thread_id is not None:
        updates["TELEGRAM_BOT_COMMAND_THREAD_ID"] = str(data.telegram_bot_command_thread_id)
    if data.opengrep_image is not None:
        updates["OPENGREP_IMAGE"] = data.opengrep_image.strip()
    if data.trivy_image is not None:
        updates["TRIVY_IMAGE"] = data.trivy_image.strip()
    if data.trufflehog_image is not None:
        updates["TRUFFLEHOG_IMAGE"] = data.trufflehog_image.strip()
    if data.max_concurrent_scans is not None:
        updates["MAX_CONCURRENT_SCANS"] = str(data.max_concurrent_scans)

    for k, v in updates.items():
        res = await db.execute(select(SystemSetting).where(SystemSetting.key == k))
        setting_item = res.scalar_one_or_none()
        if setting_item:
            setting_item.value = v
        else:
            db.add(SystemSetting(key=k, value=v))

    await db.commit()
    await sync_settings_to_config(db)

    return SystemSettingsResponse(
        telegram_bot_token=settings.TELEGRAM_BOT_TOKEN,
        telegram_chat_id=settings.TELEGRAM_CHAT_ID,
        telegram_bot_command_thread_id=settings.TELEGRAM_BOT_COMMAND_THREAD_ID,
        opengrep_image=settings.OPENGREP_IMAGE,
        trivy_image=settings.TRIVY_IMAGE,
        trufflehog_image=settings.TRUFFLEHOG_IMAGE,
        max_concurrent_scans=settings.MAX_CONCURRENT_SCANS,
    )


@router.post("/test-telegram")
async def test_telegram_connection(
    payload: TelegramTestPayload | None = None,
    current_user: User = Depends(get_current_active_user),
):
    """Test connection to Telegram API."""
    token = (payload and payload.telegram_bot_token) if (payload and payload.telegram_bot_token and payload.telegram_bot_token.strip()) else settings.TELEGRAM_BOT_TOKEN
    chat_id = (payload and payload.telegram_chat_id) if (payload and payload.telegram_chat_id and payload.telegram_chat_id.strip()) else settings.TELEGRAM_CHAT_ID
    thread_id = payload.telegram_bot_command_thread_id if (payload and payload.telegram_bot_command_thread_id is not None) else None

    if not token or not str(token).strip():
        raise HTTPException(
            status_code=400,
            detail="Thiếu Telegram Bot Token. Vui lòng nhập Bot Token để thử nghiệm."
        )

    if not chat_id or not str(chat_id).strip():
        raise HTTPException(
            status_code=400,
            detail="Thiếu Telegram Chat ID. Vui lòng nhập Chat ID để thử nghiệm."
        )

    token_clean = str(token).strip()
    chat_id_clean = str(chat_id).strip()

    url = f"https://api.telegram.org/bot{token_clean}/sendMessage"
    test_msg = (
        "🧪 <b>[SCA Platform] Kiểm tra kết nối Telegram thành công!</b>\n\n"
        "• <b>Trạng thái:</b> <code>CONNECTED</code>\n"
        "• <b>Hệ thống:</b> Static Code Analysis Platform\n"
        "• <b>Thông báo:</b> Cấu hình Bot Telegram của bạn đã hoạt động chính xác!"
    )
    
    data = {
        "chat_id": chat_id_clean,
        "text": test_msg,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if thread_id is not None and thread_id > 0:
        data["message_thread_id"] = thread_id

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=data)
            resp_json = resp.json()
            if resp.status_code == 200 and resp_json.get("ok"):
                return {
                    "status": "success",
                    "message": f"Gửi tin nhắn kiểm tra thành công tới Chat ID {chat_id_clean}!",
                    "telegram_result": resp_json.get("result")
                }
            
            # If failed and message_thread_id was included, try fallback without message_thread_id
            if "message_thread_id" in data:
                data_no_thread = dict(data)
                del data_no_thread["message_thread_id"]
                resp_fallback = await client.post(url, json=data_no_thread)
                fallback_json = resp_fallback.json()
                if resp_fallback.status_code == 200 and fallback_json.get("ok"):
                    return {
                        "status": "success",
                        "message": f"Gửi tin nhắn kiểm tra thành công tới Chat ID {chat_id_clean} (không dùng Topic ID)!",
                        "telegram_result": fallback_json.get("result")
                    }

            desc = resp_json.get("description", f"Mã lỗi HTTP {resp.status_code}")
            raise HTTPException(
                status_code=400,
                detail=f"Telegram API từ chối kết nối: {desc}"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to test Telegram connection: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Không thể kết nối tới Telegram API: {str(e)}"
        )
