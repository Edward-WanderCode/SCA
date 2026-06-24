"""Telegram Bot Polling and Callback Handlers."""

import asyncio
import logging
import httpx
from pathlib import Path
from config import settings
from db.session import async_session_factory
from models.project import Project
from models.scan import Scan, ScanStatus, ScanType
from utils.telegram import send_telegram_notification, delete_telegram_topic, escape_html

logger = logging.getLogger(__name__)


async def start_telegram_bot_polling():
    """
    Background task to poll Telegram for callback queries and messages.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID

    if not token or not chat_id:
        logger.info("Telegram Bot Polling not started: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured.")
        return

    url = f"https://api.telegram.org/bot{token}/getUpdates"
    offset = 0

    logger.info("Starting Telegram Bot Polling background task...")

    # Wait a few seconds to let the DB initialize first
    await asyncio.sleep(5)

    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            try:
                params = {"offset": offset, "timeout": 20}
                response = await client.get(url, params=params)
                if response.status_code != 200:
                    await asyncio.sleep(5)
                    continue

                data = response.json()
                if not data.get("ok"):
                    await asyncio.sleep(5)
                    continue

                for update in data.get("result", []):
                    offset = update["update_id"] + 1
                    
                    # Handle Callback Query
                    if "callback_query" in update:
                        # Schedule handling in the background so polling is not blocked
                        asyncio.create_task(handle_callback_query(update["callback_query"]))

            except asyncio.CancelledError:
                logger.info("Telegram Bot Polling task cancelled.")
                break
            except Exception as e:
                logger.error(f"Error in Telegram Bot Polling loop: {e}")
                await asyncio.sleep(5)


async def handle_callback_query(callback_query: dict):
    """
    Handle callback queries from Telegram inline buttons.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return

    query_id = callback_query["id"]
    data = callback_query.get("data", "")
    message = callback_query.get("message", {})
    message_thread_id = message.get("message_thread_id")

    logger.info(f"Received Telegram callback query: {data}")

    # Answer callback query to dismiss loading state in client
    answer_url = f"https://api.telegram.org/bot{token}/answerCallbackQuery"
    try:
        async with httpx.AsyncClient() as client:
            await client.post(answer_url, json={"callback_query_id": query_id})
    except Exception as e:
        logger.error(f"Failed to answer callback query: {e}")

    # Process request based on callback data payload
    if data.startswith("delete:"):
        project_id = data.replace("delete:", "")
        await process_delete_project(project_id)
    elif data.startswith("rescan:"):
        parts = data.replace("rescan:", "").split(":")
        if len(parts) == 2:
            project_id, scan_type = parts[0], parts[1]
            await process_rescan_project(project_id, scan_type, message_thread_id)


async def process_delete_project(project_id: str):
    """
    Delete project from DB (cascading scans and findings) and remove its Telegram topic.
    """
    project_name = "Unknown"
    topic_id = None
    
    async with async_session_factory() as session:
        try:
            # Fetch the project
            project = await session.get(Project, project_id)
            if not project:
                logger.warning(f"Telegram delete command: Project {project_id} not found.")
                return

            project_name = project.name
            topic_id = project.telegram_topic_id

            # Cascade delete in DB
            await session.delete(project)
            await session.commit()
            logger.info(f"Project '{project_name}' ({project_id}) deleted from database via Telegram action.")

            # Notify the main group chat
            msg = f"🗑️ <b>[SCA Platform]</b> Đã xóa dự án <b>{escape_html(project_name)}</b> thành công (bao gồm phần mềm và Topic Telegram)."
            send_telegram_notification(msg)

            # Delete the Telegram forum topic
            if topic_id:
                delete_telegram_topic(topic_id)

        except Exception as e:
            logger.error(f"Error deleting project {project_id} from Telegram command: {e}")


async def process_rescan_project(project_id: str, scan_type: str, message_thread_id: int | None):
    """
    Create a new Scan record and queue the appropriate Celery task for the project.
    """
    async with async_session_factory() as session:
        try:
            project = await session.get(Project, project_id)
            if not project:
                msg = "❌ Không thể quét lại: Dự án không tồn tại."
                send_telegram_notification(msg, message_thread_id=message_thread_id)
                return

            # Create scan
            scan = Scan(
                project_id=project.id,
                scan_type=ScanType(scan_type),
                status=ScanStatus.PENDING,
            )
            session.add(scan)
            await session.commit()
            await session.refresh(scan)

            # Trigger appropriate Celery task
            if project.repo_url.startswith("folder://"):
                folder_path = project.repo_url.replace("folder://", "")
                from workers.tasks import run_local_folder_scan
                task = run_local_folder_scan.delay(scan.id, scan.scan_type.value, folder_path)
                scan.celery_task_id = task.id
            elif project.repo_url.startswith("local://"):
                project_workspace_dir = Path(settings.SCAN_WORKSPACE_DIR) / "projects" / project.id
                project_src_dir = project_workspace_dir / "src"
                from workers.tasks import run_local_scan
                task = run_local_scan.delay(scan.id, scan.scan_type.value, str(project_src_dir))
                scan.celery_task_id = task.id
            else:
                from workers.tasks import run_scan
                task = run_scan.delay(scan.id, scan.scan_type.value)
                scan.celery_task_id = task.id

            await session.commit()

            # Send update to project topic
            msg = (
                f"🔄 <b>[SCA Platform]</b> Đã kích hoạt quét lại dự án <b>{escape_html(project.name)}</b>...\n"
                f"• <b>Loại quét:</b> <code>{scan.scan_type.value.upper()}</code>\n"
                f"• <b>ID quét:</b> <code>{scan.id}</code>"
            )
            send_telegram_notification(msg, message_thread_id=project.telegram_topic_id)

        except Exception as e:
            logger.error(f"Error rescanning project {project_id} from Telegram command: {e}")
            msg = f"❌ Gặp lỗi khi kích hoạt quét lại: {str(e)}"
            send_telegram_notification(msg, message_thread_id=message_thread_id)
