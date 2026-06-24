"""Telegram Bot Polling and Callback Handlers."""

import asyncio
import logging
import uuid
import zipfile
import shutil
import httpx
from pathlib import Path
from config import settings
from db.session import async_session_factory
from models.project import Project
from models.scan import Scan, ScanStatus, ScanType
from utils.telegram import send_telegram_notification, delete_telegram_topic, escape_html

logger = logging.getLogger(__name__)


def is_command_available(cmd: str) -> bool:
    """Check if a system command is available in the system PATH."""
    import shutil
    return shutil.which(cmd) is not None


async def start_telegram_bot_polling():
    """
    Background task to poll Telegram for callback queries and messages.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID

    print(f"DEBUG: start_telegram_bot_polling started. Token configured: {bool(token)}, Chat ID: {chat_id}")

    if not token or not chat_id:
        print("DEBUG: Telegram Bot Polling not started: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured.")
        return

    url = f"https://api.telegram.org/bot{token}/getUpdates"
    offset = 0

    print("DEBUG: Starting Telegram Bot Polling background loop...")

    # Wait a few seconds to let the DB initialize first
    await asyncio.sleep(5)

    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            try:
                params = {"offset": offset, "timeout": 20}
                print(f"DEBUG: Polling updates with offset {offset}...")
                response = await client.get(url, params=params)
                print(f"DEBUG: Poll response status: {response.status_code}")
                if response.status_code != 200:
                    await asyncio.sleep(5)
                    continue

                data = response.json()
                if not data.get("ok"):
                    print(f"DEBUG: Poll response not OK: {data}")
                    await asyncio.sleep(5)
                    continue

                results = data.get("result", [])
                if results:
                    print(f"DEBUG: Received {len(results)} updates")
                for update in results:
                    offset = update["update_id"] + 1
                    print(f"DEBUG: Processing update_id: {update['update_id']} | Type: {'callback_query' if 'callback_query' in update else 'message' if 'message' in update else 'other'}")
                    
                    # Handle Callback Query
                    if "callback_query" in update:
                        asyncio.create_task(handle_callback_query(update["callback_query"]))
                        
                    # Handle Message
                    elif "message" in update:
                        asyncio.create_task(handle_message(update["message"]))

            except asyncio.CancelledError:
                print("DEBUG: Telegram Bot Polling task cancelled.")
                break
            except Exception as e:
                print(f"DEBUG: Error in Telegram Bot Polling loop: {e}")
                await asyncio.sleep(5)


async def handle_message(message: dict):
    """
    Filter messages that are sent inside the Bot Command topic containing document uploads.
    """
    message_thread_id = message.get("message_thread_id")
    print(f"DEBUG: handle_message message_thread_id: {message_thread_id} | Target thread ID: {settings.TELEGRAM_BOT_COMMAND_THREAD_ID}")
    if message_thread_id != settings.TELEGRAM_BOT_COMMAND_THREAD_ID:
        return

    # Check if the message contains a document
    if "document" in message:
        print(f"DEBUG: handle_message: found document: {message['document'].get('file_name')}")
        await handle_document_upload(message)
    else:
        print(f"DEBUG: handle_message: no document in message: {list(message.keys())}")


async def download_telegram_file(file_id: str, dest_path: Path) -> bool:
    """
    Download a file from Telegram server using the bot token.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return False
        
    async with httpx.AsyncClient() as client:
        try:
            # 1. Get file path
            url = f"https://api.telegram.org/bot{token}/getFile"
            res = await client.get(url, params={"file_id": file_id})
            if res.status_code != 200:
                return False
                
            data = res.json()
            if not data.get("ok"):
                return False
                
            file_path = data["result"]["file_path"]
            download_url = f"https://api.telegram.org/file/bot{token}/{file_path}"
            
            # 2. Download and save
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            async with client.stream("GET", download_url) as response:
                if response.status_code != 200:
                    return False
                with open(dest_path, "wb") as f:
                    async for chunk in response.aiter_bytes():
                        f.write(chunk)
            return True
        except Exception as e:
            logger.error(f"Error downloading Telegram file {file_id}: {e}")
            return False


async def handle_document_upload(message: dict):
    """
    Validate uploaded file: check format, file size, and ZIP password.
    If checks pass, present the user with a 'Start Scan' button.
    """
    document = message["document"]
    file_id = document["file_id"]
    file_name = document.get("file_name", "unknown_file")
    file_size = document.get("file_size", 0)
    thread_id = message.get("message_thread_id")

    # 1. Check size (50MB limit)
    MAX_SIZE = 50 * 1024 * 1024  # 50MB
    if file_size > MAX_SIZE:
        size_mb = round(file_size / (1024 * 1024), 2)
        reply = f"❌ <b>Lỗi tải lên:</b> Dung lượng tệp tin quá lớn ({size_mb} MB). Giới hạn tối đa là 50 MB."
        send_telegram_notification(reply, message_thread_id=thread_id)
        return

    # 2. Check format
    is_zip = file_name.lower().endswith(".zip")
    is_rar = file_name.lower().endswith(".rar")
    
    if is_rar and not is_command_available("lsar"):
        reply = "❌ <b>Lỗi tải lên:</b> Hệ thống chưa cấu hình công cụ hỗ trợ đọc tệp nén RAR (lsar). Vui lòng gửi tệp ZIP thay thế hoặc liên hệ quản trị viên."
        send_telegram_notification(reply, message_thread_id=thread_id)
        return

    supported_extensions = {
        ".py", ".js", ".ts", ".go", ".java", ".c", ".cpp", ".h", ".hpp",
        ".cs", ".php", ".rb", ".json", ".yml", ".yaml", ".rs", ".kt", ".swift",
        ".tsx", ".jsx"
    }
    file_ext = Path(file_name).suffix.lower()
    
    if not is_zip and not is_rar and file_ext not in supported_extensions:
        reply = (
            f"❌ <b>Lỗi tải lên:</b> Định dạng tệp tin không được hỗ trợ (<code>{escape_html(file_ext)}</code>).\n"
            f"Vui lòng gửi tệp <code>.zip</code>/<code>.rar</code> mã nguồn hoặc tệp mã nguồn đơn lẻ (ví dụ: <code>.py</code>, <code>.js</code>, <code>.go</code>)."
        )
        send_telegram_notification(reply, message_thread_id=thread_id)
        return

    # Create temporary download path
    upload_uuid = str(uuid.uuid4())
    temp_dir = Path(settings.SCAN_WORKSPACE_DIR) / "temp_telegram_uploads"
    temp_file_path = temp_dir / f"{upload_uuid}_{file_name}"
    
    # Download file
    success = await download_telegram_file(file_id, temp_file_path)
    if not success:
        reply = "❌ <b>Lỗi tải lên:</b> Không thể tải xuống tệp tin từ Telegram. Vui lòng thử lại."
        send_telegram_notification(reply, message_thread_id=thread_id)
        return

    # 3. Check if ZIP/RAR is encrypted (has password)
    is_encrypted = False
    if is_zip:
        try:
            with zipfile.ZipFile(temp_file_path) as zf:
                for zinfo in zf.infolist():
                    if zinfo.flag_bits & 0x1:
                        is_encrypted = True
                        break
        except Exception:
            reply = "❌ <b>Lỗi tải lên:</b> Tệp tin ZIP bị hỏng hoặc không hợp lệ."
            send_telegram_notification(reply, message_thread_id=thread_id)
            if temp_file_path.exists():
                temp_file_path.unlink()
            return
    elif is_rar:
        try:
            import subprocess
            result = subprocess.run(
                ["lsar", "-t", str(temp_file_path)],
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True
            )
            if result.returncode != 0:
                is_encrypted = True
        except Exception as e:
            logger.error(f"lsar test failed: {e}")
            reply = "❌ <b>Lỗi tải lên:</b> Không thể xác minh tính toàn vẹn của tệp RAR."
            send_telegram_notification(reply, message_thread_id=thread_id)
            if temp_file_path.exists():
                temp_file_path.unlink()
            return

    if is_encrypted:
        file_label = "ZIP" if is_zip else "RAR"
        reply = f"❌ <b>Lỗi tải lên:</b> Tệp tin {file_label} bị khóa mật khẩu. Vui lòng gửi tệp không có mật khẩu."
        send_telegram_notification(reply, message_thread_id=thread_id)
        if temp_file_path.exists():
            temp_file_path.unlink()
        return

    # Format file size for presentation
    if file_size < 1024 * 1024:
        size_str = f"{round(file_size / 1024, 2)} KB"
    else:
        size_str = f"{round(file_size / (1024 * 1024), 2)} MB"

    # Present success check and Start Scan button
    if is_zip:
        file_type_str = "Tệp nén ZIP"
    elif is_rar:
        file_type_str = "Tệp nén RAR"
    else:
        file_type_str = f"Tệp mã nguồn ({escape_html(file_ext)})"

    reply_markup = [
        [
            {
                "text": "▶️ Bắt đầu quét (Start Scan)",
                "callback_data": f"tg_scan:{upload_uuid}"
            }
        ]
    ]
    
    msg = (
        f"✅ <b>Kiểm tra tệp tin thành công!</b>\n\n"
        f"• <b>Tên tệp:</b> <code>{escape_html(file_name)}</code>\n"
        f"• <b>Dung lượng:</b> <code>{size_str}</code>\n"
        f"• <b>Loại tệp:</b> {file_type_str}\n"
        f"• <b>Bảo mật:</b> Không khóa mật khẩu\n\n"
        f"Bấm nút bên dưới để bắt đầu quét dự án này."
    )
    send_telegram_notification(msg, message_thread_id=thread_id, inline_keyboard=reply_markup)


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
    elif data.startswith("tg_scan:"):
        upload_uuid = data.replace("tg_scan:", "")
        await process_telegram_scan_trigger(upload_uuid, message_thread_id)


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

            # Create scan (Rescans are always combined scans now)
            scan = Scan(
                project_id=project.id,
                scan_type=ScanType.COMBINED,
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


async def process_telegram_scan_trigger(upload_uuid: str, current_thread_id: int | None):
    """
    Process callback for file scans triggered from Bot Command topic.
    Extracts ZIP/saves single file, sets up Project/Scans, and launches task.
    """
    temp_dir = Path(settings.SCAN_WORKSPACE_DIR) / "temp_telegram_uploads"
    matching_files = list(temp_dir.glob(f"{upload_uuid}_*"))
    
    if not matching_files:
        msg = "❌ Không tìm thấy tệp tin tải lên hoặc phiên tải lên đã hết hạn."
        send_telegram_notification(msg, message_thread_id=current_thread_id)
        return
        
    temp_file_path = matching_files[0]
    file_name = temp_file_path.name.replace(f"{upload_uuid}_", "")
    is_zip = file_name.lower().endswith(".zip")
    is_rar = file_name.lower().endswith(".rar")
    
    # 1. Create a Project in DB
    clean_name = file_name.replace(".zip", "").replace(".rar", "").replace(".ZIP", "").replace(".RAR", "")
    project_name = f"Telegram: {clean_name}"
    repo_url = f"local://telegram_{upload_uuid}_{file_name}"
    
    async with async_session_factory() as session:
        try:
            # Create Project
            project = Project(
                name=project_name,
                repo_url=repo_url,
                description=f"Tải lên qua Telegram Topic Bot Command",
                branch="local"
            )
            session.add(project)
            await session.commit()
            await session.refresh(project)
            
            # 2. Extract ZIP or RAR or copy single file to project workspace
            project_workspace_dir = Path(settings.SCAN_WORKSPACE_DIR) / "projects" / project.id
            project_src_dir = project_workspace_dir / "src"
            project_src_dir.mkdir(parents=True, exist_ok=True)
            
            if is_zip:
                with zipfile.ZipFile(temp_file_path, "r") as zf:
                    zf.extractall(project_src_dir)
            elif is_rar:
                if not is_command_available("unar"):
                    raise RuntimeError("Công cụ unar không khả dụng trong hệ thống.")
                import subprocess
                subprocess.run(
                    ["unar", "-o", str(project_src_dir), str(temp_file_path)],
                    stdin=subprocess.DEVNULL,
                    check=True
                )
            else:
                # Copy single file to src folder
                shutil.copy(temp_file_path, project_src_dir / file_name)
                
            # Clean up temp upload file
            if temp_file_path.exists():
                temp_file_path.unlink()
                
            # 3. Create a single combined Scan record
            scan = Scan(
                project_id=project.id,
                scan_type=ScanType.COMBINED,
                status=ScanStatus.PENDING,
            )
            session.add(scan)
            await session.commit()
            await session.refresh(scan)
                
            # 4. Trigger local scan via Celery task
            from workers.tasks import run_local_scan
            task = run_local_scan.delay(scan.id, ScanType.COMBINED.value, str(project_src_dir))
            scan.celery_task_id = task.id
                
            await session.commit()
            
            # Notify in Bot Command topic that scan started
            msg = (
                f"🚀 <b>Đã bắt đầu quét dự án!</b>\n\n"
                f"• <b>Dự án:</b> <b>{escape_html(project_name)}</b>\n"
                f"• <b>ID dự án:</b> <code>{project.id}</code>\n"
                f"• Đã tạo Topic Telegram riêng cho dự án này. Kết quả quét sẽ được gửi và ghim tại Topic đó."
            )
            send_telegram_notification(msg, message_thread_id=current_thread_id)
            
        except Exception as e:
            logger.error(f"Failed to trigger Telegram scan for {file_name}: {e}")
            msg = f"❌ Gặp lỗi khi tạo phiên quét dự án: {str(e)}"
            send_telegram_notification(msg, message_thread_id=current_thread_id)
            if temp_file_path.exists():
                temp_file_path.unlink()
