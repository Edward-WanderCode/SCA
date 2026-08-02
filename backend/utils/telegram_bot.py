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
from sqlalchemy import select
from models.project import Project
from models.scan import Scan, ScanStatus, ScanType
from utils.telegram import send_telegram_notification, delete_telegram_topic, escape_html, get_telegram_api_base_url

logger = logging.getLogger(__name__)


def is_command_available(cmd: str) -> bool:
    """Check if a system command is available in the system PATH."""
    import shutil
    return shutil.which(cmd) is not None


async def start_telegram_bot_polling():
    """
    Background task to poll Telegram for callback queries and messages.
    Dynamically loads credentials from DB/settings so polling auto-starts as soon as configured.
    """
    logger.info("Starting Telegram Bot Polling background loop...")

    # Wait a few seconds to let DB initialize
    await asyncio.sleep(5)
    offset = 0

    while True:
        try:
            from utils.telegram import get_telegram_credentials
            token, chat_id, _ = get_telegram_credentials()

            if not token or not chat_id:
                await asyncio.sleep(10)
                continue

            base_url = get_telegram_api_base_url()
            url = f"{base_url}/bot{token}/getUpdates"

            async with httpx.AsyncClient(timeout=30.0) as client:
                while True:
                    current_token, current_chat_id, _ = get_telegram_credentials()
                    if not current_token or not current_chat_id or current_token != token:
                        await asyncio.sleep(5)
                        break

                    params = {"offset": offset, "timeout": 20}
                    try:
                        response = await client.get(url, params=params)
                    except (httpx.ConnectError, httpx.TimeoutException, httpx.RequestError) as net_err:
                        if "telegram-bot-api" in url or "localhost" in url or "127.0.0.1" in url:
                            alt_url = url.replace(base_url, "https://api.telegram.org")
                            if alt_url != url:
                                try:
                                    response = await client.get(alt_url, params=params)
                                except Exception:
                                    await asyncio.sleep(10)
                                    continue
                            else:
                                await asyncio.sleep(10)
                                continue
                        else:
                            await asyncio.sleep(10)
                            continue

                    if response.status_code != 200:
                        await asyncio.sleep(5)
                        continue


                    data = response.json()
                    if not data.get("ok"):
                        await asyncio.sleep(5)
                        continue

                    results = data.get("result", [])
                    for update in results:
                        offset = update["update_id"] + 1
                        logger.info(f"Telegram Bot Update {update['update_id']} received. Type: {'callback_query' if 'callback_query' in update else 'message' if 'message' in update else 'other'}")
                        
                        # Handle Callback Query (Inline Buttons)
                        if "callback_query" in update:
                            asyncio.create_task(handle_callback_query(update["callback_query"]))
                            
                        # Handle Message
                        elif "message" in update:
                            asyncio.create_task(handle_message(update["message"]))

        except asyncio.CancelledError:
            logger.info("Telegram Bot Polling task cancelled.")
            break
        except Exception as e:
            logger.error(f"Error in Telegram Bot Polling loop: {e}")
            await asyncio.sleep(5)


async def handle_message(message: dict):
    """
    Filter messages that contain document uploads (ZIP/RAR/source files) and present the Start Scan button.
    """
    try:
        if "document" not in message:
            return

        from utils.telegram import get_telegram_credentials
        _, _, default_command_thread = get_telegram_credentials()

        message_thread_id = message.get("message_thread_id")
        target_thread = settings.TELEGRAM_BOT_COMMAND_THREAD_ID or default_command_thread

        # Process document if uploaded to target command topic or if target_thread matches or is unrestricted
        if target_thread is None or message_thread_id == target_thread:
            await handle_document_upload(message)
        else:
            # Also allow ZIP/RAR file uploads sent to any topic
            file_name = message["document"].get("file_name", "").lower()
            if file_name.endswith(".zip") or file_name.endswith(".rar"):
                await handle_document_upload(message)
    except Exception as e:
        logger.exception(f"Unhandled exception in handle_message: {e}")


async def download_telegram_file(file_id: str, dest_path: Path) -> bool:
    """
    Download a file from Telegram server using the bot token.
    """
    from utils.telegram import get_telegram_credentials, get_telegram_api_base_url
    token, _, _ = get_telegram_credentials()
    if not token:
        return False
        
    async with httpx.AsyncClient() as client:
        try:
            base_url = get_telegram_api_base_url()
            # 1. Get file path
            url = f"{base_url}/bot{token}/getFile"
            res = await client.get(url, params={"file_id": file_id})
            if res.status_code != 200:
                return False
                
            data = res.json()
            if not data.get("ok"):
                return False
                
            file_path = data["result"]["file_path"]
            download_url = f"{base_url}/file/bot{token}/{file_path}"
            
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

    # 1. Check size (2GB limit for local server)
    MAX_SIZE = 2000 * 1024 * 1024  # 2000 MB (2 GB)
    if file_size > MAX_SIZE:
        size_mb = round(file_size / (1024 * 1024), 2)
        reply = f"❌ <b>Lỗi tải lên:</b> Dung lượng tệp tin quá lớn ({size_mb} MB). Giới hạn tối đa là 2000 MB (2 GB)."
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
    base_url = get_telegram_api_base_url()
    answer_url = f"{base_url}/bot{token}/answerCallbackQuery"
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
    Delete project from DB (cascading scans and findings), clean workspace, clear Redis cache, and remove its Telegram topic.
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

            # 1. Cascade delete scans and findings in DB
            from models.scan import Scan
            from models.finding import Finding
            from sqlalchemy import delete
            
            scan_ids_q = select(Scan.id).where(Scan.project_id == project_id)
            scan_ids_res = await session.execute(scan_ids_q)
            scan_ids = scan_ids_res.scalars().all()
            
            if scan_ids:
                await session.execute(delete(Finding).where(Finding.scan_id.in_(scan_ids)))
                await session.execute(delete(Scan).where(Scan.id.in_(scan_ids)))

            # 2. Delete project folder from workspace
            try:
                import shutil, stat, os
                from pathlib import Path
                project_dir = Path(settings.SCAN_WORKSPACE_DIR) / "projects" / project_id
                if project_dir.exists():
                    def _force_remove_readonly(func, path, _):
                        try:
                            os.chmod(path, stat.S_IWRITE)
                            func(path)
                        except Exception:
                            pass
                    shutil.rmtree(project_dir, onerror=_force_remove_readonly)
            except Exception as fe:
                logger.error(f"Failed to remove project folder on disk: {fe}")

            # 3. Delete project record
            await session.delete(project)
            await session.commit()
            logger.info(f"Project '{project_name}' ({project_id}) deleted from database via Telegram action.")

            # 4. Clear all Redis API caches so Web UI updates immediately
            try:
                from core.cache import clear_all_api_caches
                await clear_all_api_caches()
            except Exception as ce:
                logger.error(f"Failed to clear Redis cache on Telegram delete: {ce}")

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

            # Ensure project has a Telegram topic; create one if missing so rescan notifications go to project topic
            if not project.telegram_topic_id:
                try:
                    from utils.telegram import create_telegram_topic
                    thread_id = create_telegram_topic(project.name)
                    if thread_id:
                        project.telegram_topic_id = thread_id
                        session.add(project)
                        await session.commit()
                except Exception as e:
                    logger.error(f"Failed to create Telegram topic for project during rescan: {e}")

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

            # Send update to project topic (or fallback to provided message_thread_id)
            msg = (
                f"🔄 <b>[SCA Platform]</b> Đã kích hoạt quét lại dự án <b>{escape_html(project.name)}</b>...\n"
                f"• <b>Loại quét:</b> <code>{scan.scan_type.value.upper()}</code>\n"
                f"• <b>ID quét:</b> <code>{scan.id}</code>"
            )
            target_thread = project.telegram_topic_id or message_thread_id
            send_telegram_notification(msg, message_thread_id=target_thread)

        except Exception as e:
            logger.error(f"Error rescanning project {project_id} from Telegram command: {e}")
            msg = f"❌ Gặp lỗi khi kích hoạt quét lại: {escape_html(str(e))}"
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
    
    # 1. Create or reuse a Project in DB based on the uploaded filename
    clean_name = file_name.replace(".zip", "").replace(".rar", "").replace(".ZIP", "").replace(".RAR", "")
    stable_repo_url = f"local://{file_name}"
    project_name = clean_name

    async with async_session_factory() as session:
        try:
            # Try exact match for a previously uploaded local file project
            proj_q = select(Project).where(Project.repo_url == stable_repo_url)
            proj_res = await session.execute(proj_q)
            project = proj_res.scalars().first()

            # Fallback: try fuzzy match for any local:// project that ends with the same filename
            if not project:
                fuzzy_q = select(Project).where(
                    Project.repo_url.like(f"%{file_name}") & Project.repo_url.startswith("local://")
                )
                fuzzy_res = await session.execute(fuzzy_q)
                project = fuzzy_res.scalars().first()

            if not project:
                # Create new project using stable local repo_url so future uploads reuse it
                repo_url = stable_repo_url
                project = Project(
                    name=project_name,
                    repo_url=repo_url,
                    description=f"Tải lên qua Telegram Topic Bot Command",
                    branch="local"
                )
                session.add(project)
                await session.commit()
                await session.refresh(project)
            else:
                project_name = project.name
            
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
            msg = f"❌ Gặp lỗi khi tạo phiên quét dự án: {escape_html(str(e))}"
            send_telegram_notification(msg, message_thread_id=current_thread_id)
            if temp_file_path.exists():
                temp_file_path.unlink()
