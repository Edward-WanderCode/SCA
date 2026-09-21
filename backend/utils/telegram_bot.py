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
    Process incoming Telegram messages:
    1. In 'Zip file upload' topic: Silently save uploaded ZIP files (filename + file_id) to DB without notification.
    2. In 'Bot Command' topic:
       - Handle /scan: display interactive button list of uploaded ZIP files.
       - Handle document upload: validate and offer Start Scan button.
    3. Any topic:
       - Handle /topicid or /id: display the current thread ID for easy setup.
    """
    try:
        from utils.telegram import get_telegram_credentials, get_zip_upload_thread_id
        _, _, default_command_thread = get_telegram_credentials()

        message_thread_id = message.get("message_thread_id")
        try:
            current_thread_id = int(message_thread_id) if message_thread_id is not None else None
        except (ValueError, TypeError):
            current_thread_id = None

        target_command_thread = settings.TELEGRAM_BOT_COMMAND_THREAD_ID or default_command_thread
        zip_upload_thread = get_zip_upload_thread_id()

        try:
            command_thread_id = int(target_command_thread) if target_command_thread is not None else None
        except (ValueError, TypeError):
            command_thread_id = None

        try:
            zip_thread_id = int(zip_upload_thread) if zip_upload_thread is not None else None
        except (ValueError, TypeError):
            zip_thread_id = None

        logger.info(
            f"Telegram message received: thread_id={current_thread_id}, "
            f"has_doc={'document' in message}, has_text={'text' in message}"
        )

        # 1. Check if document is uploaded
        if "document" in message:
            doc = message["document"]
            file_name = doc.get("file_name", "")
            file_id = doc.get("file_id")
            file_size = doc.get("file_size", 0)

            # Check if uploaded in 'Zip file upload' topic
            if zip_thread_id is not None and current_thread_id == zip_thread_id:
                if file_name.lower().endswith(".zip"):
                    from models.uploaded_file import UploadedFile
                    msg_id = message.get("message_id")
                    chat_id_val = str(message.get("chat", {}).get("id") or "")
                    async with async_session_factory() as session:
                        q = select(UploadedFile).where(UploadedFile.file_name == file_name)
                        res = await session.execute(q)
                        existing = res.scalars().first()
                        if existing:
                            existing.telegram_file_id = file_id
                            existing.telegram_message_id = msg_id
                            existing.telegram_chat_id = chat_id_val
                            existing.file_size = file_size
                        else:
                            new_file = UploadedFile(
                                file_name=file_name,
                                telegram_file_id=file_id,
                                telegram_message_id=msg_id,
                                telegram_chat_id=chat_id_val,
                                file_size=file_size,
                            )
                            session.add(new_file)
                        await session.commit()
                    logger.info(f"Silently saved uploaded ZIP: {file_name} in Zip file upload topic (thread {zip_thread_id}, msg_id {msg_id})")
                    # Không thông báo gì thêm theo đúng yêu cầu
                    return
                else:
                    logger.info(f"Ignored non-ZIP file in Zip file upload topic: {file_name}")
                    return

            # Check if uploaded in 'Bot Command' topic
            if command_thread_id is not None and current_thread_id == command_thread_id:
                await handle_document_upload(message)
                return

            logger.info(f"Document ignored in unconfigured thread {current_thread_id}")
            return

        # 2. Check text commands
        text = message.get("text", "").strip()
        if not text:
            return

        # Command /topicid or /id works in any topic to help user find thread IDs
        if text in ("/topicid", "/id"):
            reply = (
                f"ℹ️ <b>Thông tin Topic ID:</b>\n\n"
                f"• <b>Thread ID hiện tại:</b> <code>{current_thread_id}</code>\n"
                f"• <b>Bot Command Thread:</b> <code>{command_thread_id}</code>\n"
                f"• <b>Zip Upload Thread:</b> <code>{zip_thread_id}</code>"
            )
            send_telegram_notification(reply, message_thread_id=current_thread_id)
            return

        # Commands specifically in Bot Command topic
        if command_thread_id is not None and current_thread_id == command_thread_id:
            if text.startswith("/scan"):
                from models.uploaded_file import UploadedFile
                async with async_session_factory() as session:
                    q = select(UploadedFile).order_by(UploadedFile.created_at.desc()).limit(20)
                    res = await session.execute(q)
                    files = res.scalars().all()

                if not files:
                    reply = (
                        "ℹ️ <b>Chưa có file ZIP nào được tải lên!</b>\n\n"
                        "Vui lòng gửi file mã nguồn <code>.zip</code> vào topic <b>Zip file upload</b> trước."
                    )
                    send_telegram_notification(reply, message_thread_id=current_thread_id)
                    return

                # Build inline keyboard buttons
                base_url = get_telegram_api_base_url()
                is_official_api = "api.telegram.org" in base_url
                has_mtproto = bool(getattr(settings, 'TELEGRAM_API_ID', None) and getattr(settings, 'TELEGRAM_API_HASH', None))
                inline_keyboard = []
                for f in files:
                    file_size_bytes = f.file_size or 0
                    if file_size_bytes >= 1024 * 1024:
                        size_str = f" ({round(file_size_bytes / (1024 * 1024), 1)} MB)"
                    elif file_size_bytes > 0:
                        size_str = f" ({round(file_size_bytes / 1024, 1)} KB)"
                    else:
                        size_str = ""

                    is_over_20mb_warning = file_size_bytes > 20 * 1024 * 1024 and is_official_api and not has_mtproto
                    icon = "⚠️" if is_over_20mb_warning else "📦"
                    btn_text = f"{icon} {f.file_name}{size_str}"
                    if is_over_20mb_warning:
                        btn_text += " [>20MB]"

                    inline_keyboard.append([
                        {
                            "text": btn_text,
                            "callback_data": f"scan_zip:{f.id}"
                        }
                    ])

                reply = (
                    "📁 <b>Danh sách file ZIP đã tải lên:</b>\n\n"
                    "Bấm chọn file bạn muốn tiến hành quét an ninh mã nguồn:"
                )
                send_telegram_notification(reply, message_thread_id=current_thread_id, inline_keyboard=inline_keyboard)
                return

            elif text in ("/start", "/help"):
                reply = (
                    "🤖 <b>SCA Security Platform Bot</b>\n\n"
                    "• <b>Tải file:</b> Gửi file <code>.zip</code> vào topic <b>Zip file upload</b>\n"
                    "• <b>Quét mã:</b> Gõ lệnh <code>/scan</code> tại đây để chọn file và kích hoạt quét\n"
                    "• <b>Tra cứu ID Topic:</b> Gõ <code>/topicid</code> tại bất kỳ topic nào"
                )
                send_telegram_notification(reply, message_thread_id=current_thread_id)
                return

    except Exception as e:
        logger.exception(f"Unhandled exception in handle_message: {e}")


_telethon_lock = asyncio.Lock()


async def download_via_telethon(chat_id: int | str, message_id: int, dest_path: Path) -> tuple[bool, str]:
    """
    Download a file from Telegram using Telethon (MTProto).
    Bypasses the 20MB Bot API HTTP limit and supports files up to 2GB.
    Uses TELEGRAM_API_ID and TELEGRAM_API_HASH configured in settings/DB.
    """
    from utils.telegram import get_telegram_credentials, get_telegram_api_credentials
    token, _, _ = get_telegram_credentials()
    api_id, api_hash = get_telegram_api_credentials()

    if not api_id or not api_hash or not token:
        logger.error(f"Missing MTProto credentials: token={bool(token)}, api_id={bool(api_id)}, api_hash={bool(api_hash)}")
        return False, "Thiếu TELEGRAM_API_ID hoặc TELEGRAM_API_HASH để tải file qua MTProto."

    async with _telethon_lock:
        client = None
        try:
            from telethon import TelegramClient
            session_dir = Path(settings.SCAN_WORKSPACE_DIR) / "telethon_sessions"
            session_dir.mkdir(parents=True, exist_ok=True)
            session_path = session_dir / "bot_downloader"

            client = TelegramClient(str(session_path), int(api_id), str(api_hash))
            await client.connect()
            if not await client.is_user_authorized():
                await client.sign_in(bot_token=token)

            target_chat = int(chat_id) if str(chat_id).lstrip('-').isdigit() else chat_id
            msg = await client.get_messages(target_chat, ids=int(message_id))
            if not msg or not msg.file:
                return False, f"Không tìm thấy file trong tin nhắn {message_id}"

            dest_path.parent.mkdir(parents=True, exist_ok=True)
            logger.info(f"Downloading {msg.file.name} ({msg.file.size} bytes) via Telethon MTProto...")
            downloaded = await client.download_media(msg, file=str(dest_path))

            if downloaded and dest_path.exists() and dest_path.stat().st_size > 0:
                logger.info(f"Successfully downloaded {dest_path.name} via Telethon MTProto ({dest_path.stat().st_size} bytes)")
                return True, ""
            return False, "Tải file qua MTProto không thành công."
        except Exception as e:
            logger.error(f"Error downloading via Telethon MTProto: {e}", exc_info=True)
            return False, str(e)
        finally:
            if client:
                try:
                    await client.disconnect()
                except Exception:
                    pass


async def download_telegram_file(
    file_id: str,
    dest_path: Path,
    chat_id: int | str | None = None,
    message_id: int | None = None,
    file_size: int | None = None,
) -> tuple[bool, str]:
    """
    Download a file from Telegram server using the bot token.
    If file > 20MB and chat_id/message_id are available, automatically downloads via Telethon (MTProto).
    """
    from utils.telegram import get_telegram_credentials, get_telegram_api_credentials, get_telegram_api_base_url
    token, default_chat_id, _ = get_telegram_credentials()
    api_id, api_hash = get_telegram_api_credentials()
    target_chat_id = chat_id or default_chat_id

    logger.info(
        f"download_telegram_file: file_name={dest_path.name}, file_size={file_size}, "
        f"chat_id={target_chat_id}, message_id={message_id}, api_id={api_id}, api_hash={'set' if api_hash else 'missing'}"
    )

    # 1. If file is known to be > 20MB and we have API ID/Hash + chat/message ID, use Telethon MTProto directly
    if file_size and file_size > 20 * 1024 * 1024:
        if target_chat_id and message_id and api_id and api_hash:
            logger.info(f"File size {file_size} > 20MB, downloading directly via Telethon MTProto...")
            success, err = await download_via_telethon(target_chat_id, message_id, dest_path)
            if success:
                return True, ""
            logger.warning(f"Telethon MTProto direct download failed ({err}), falling back to HTTP getFile")
        else:
            logger.warning(
                f"File size {file_size} > 20MB but missing MTProto parameters: "
                f"chat_id={target_chat_id}, message_id={message_id}, api_id={api_id}, api_hash={'set' if api_hash else 'missing'}"
            )

    if not token:
        return False, "Thiếu cấu hình Telegram Bot Token."
        
    async with httpx.AsyncClient() as client:
        try:
            base_url = get_telegram_api_base_url()
            # 1. Get file path
            url = f"{base_url}/bot{token}/getFile"
            res = await client.get(url, params={"file_id": file_id})
            if res.status_code != 200:
                err_desc = ""
                try:
                    err_json = res.json()
                    err_desc = err_json.get("description", "")
                except Exception:
                    err_desc = res.text
                logger.error(f"Telegram getFile error for {file_id}: HTTP {res.status_code} - {err_desc}")
                if "file is too big" in err_desc.lower():
                    # Fallback to Telethon MTProto if available!
                    if target_chat_id and message_id and api_id and api_hash:
                        logger.info("HTTP getFile returned file_too_big, falling back to Telethon MTProto...")
                        mtproto_ok, mtproto_err = await download_via_telethon(target_chat_id, message_id, dest_path)
                        if mtproto_ok:
                            return True, ""
                        return False, f"file_too_big (MTProto fallback failed: {mtproto_err})"
                    return False, "file_too_big"
                return False, f"Telegram API getFile: {err_desc}"
                
            data = res.json()
            if not data.get("ok"):
                desc = data.get("description", "Phản hồi không hợp lệ từ Telegram.")
                logger.error(f"Telegram getFile response not ok: {desc}")
                if "file is too big" in desc.lower():
                    if target_chat_id and message_id and api_id and api_hash:
                        mtproto_ok, mtproto_err = await download_via_telethon(target_chat_id, message_id, dest_path)
                        if mtproto_ok:
                            return True, ""
                        return False, f"file_too_big (MTProto fallback failed: {mtproto_err})"
                    return False, "file_too_big"
                return False, desc
                
            file_path = data["result"]["file_path"]
            download_url = f"{base_url}/file/bot{token}/{file_path}"
            
            # 2. Download and save
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            async with client.stream("GET", download_url) as response:
                if response.status_code != 200:
                    return False, f"Lỗi tải dữ liệu file (HTTP {response.status_code})"
                with open(dest_path, "wb") as f:
                    async for chunk in response.aiter_bytes():
                        f.write(chunk)
            return True, ""
        except Exception as e:
            logger.error(f"Error downloading Telegram file {file_id}: {e}")
            if target_chat_id and message_id and api_id and api_hash:
                mtproto_ok, mtproto_err = await download_via_telethon(target_chat_id, message_id, dest_path)
                if mtproto_ok:
                    return True, ""
            return False, str(e)


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
    success, err_msg = await download_telegram_file(
        file_id=file_id,
        dest_path=temp_file_path,
        chat_id=message.get("chat", {}).get("id"),
        message_id=message.get("message_id"),
        file_size=file_size,
    )
    if not success:
        if err_msg == "file_too_big":
            size_mb = round(file_size / (1024 * 1024), 2)
            reply = (
                f"❌ <b>Lỗi dung lượng tệp tin:</b>\n\n"
                f"Tệp tin <code>{escape_html(file_name)}</code> ({size_mb} MB) vượt quá giới hạn tải xuống <b>20 MB</b> của máy chủ Telegram Bot API mặc định (<code>api.telegram.org</code>).\n\n"
                f"💡 <b>Cách khắc phục:</b>\n"
                f"• Giảm dung lượng file ZIP xuống dưới 20 MB (loại bỏ thư mục <code>node_modules</code>, <code>venv</code>, <code>.git</code>, media/build artifacts...).\n"
                f"• Hoặc cấu hình <b>Local Telegram Bot API Server</b> để hỗ trợ tải file lên đến <b>2 GB</b>."
            )
        else:
            reply = f"❌ <b>Lỗi tải lên:</b> Không thể tải xuống tệp tin từ Telegram ({escape_html(err_msg)})."
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
    elif data.startswith("scan_zip:"):
        upload_id = data.replace("scan_zip:", "")
        await process_scan_uploaded_zip(upload_id, message_thread_id)


async def process_scan_uploaded_zip(upload_id: str, current_thread_id: int | None):
    """
    Handle user selecting an uploaded ZIP file to scan from Bot Command topic.
    Downloads the file from Telegram and launches the scan pipeline.
    """
    from models.uploaded_file import UploadedFile
    async with async_session_factory() as session:
        upload_rec = await session.get(UploadedFile, upload_id)
        if not upload_rec:
            msg = "❌ Không tìm thấy thông tin tệp tin trong cơ sở dữ liệu hoặc tệp đã bị xóa."
            send_telegram_notification(msg, message_thread_id=current_thread_id)
            return

        file_name = upload_rec.file_name
        telegram_file_id = upload_rec.telegram_file_id
        telegram_chat_id = upload_rec.telegram_chat_id
        telegram_message_id = upload_rec.telegram_message_id
        file_size = upload_rec.file_size

    # Create temporary download path
    upload_uuid = str(uuid.uuid4())
    temp_dir = Path(settings.SCAN_WORKSPACE_DIR) / "temp_telegram_uploads"
    temp_file_path = temp_dir / f"{upload_uuid}_{file_name}"

    size_mb = round((file_size or 0) / (1024 * 1024), 2)
    download_notice = (
        f"⏳ Đang tải file <code>{escape_html(file_name)}</code> ({size_mb} MB) từ Telegram về máy để phân tích..."
        if file_size and file_size > 20 * 1024 * 1024
        else f"⏳ Đang tải file <code>{escape_html(file_name)}</code> từ Telegram về máy để phân tích..."
    )
    send_telegram_notification(download_notice, message_thread_id=current_thread_id)

    success, err_msg = await download_telegram_file(
        file_id=telegram_file_id,
        dest_path=temp_file_path,
        chat_id=telegram_chat_id,
        message_id=telegram_message_id,
        file_size=file_size,
    )
    if not success:
        if err_msg == "file_too_big":
            msg = (
                f"❌ <b>Lỗi dung lượng tệp tin:</b>\n\n"
                f"Tệp <code>{escape_html(file_name)}</code> ({size_mb} MB) vượt quá giới hạn tải xuống <b>20 MB</b> của máy chủ Telegram Bot API mặc định (<code>api.telegram.org</code>).\n\n"
                f"💡 <b>Cách khắc phục:</b>\n"
                f"• Kiểm tra cấu hình TELEGRAM_API_ID và TELEGRAM_API_HASH để tải file dung lượng lớn qua MTProto.\n"
                f"• Hoặc cấu hình <b>Local Telegram Bot API Server</b> để hỗ trợ tải file lên đến <b>2 GB</b>."
            )
        else:
            msg = f"❌ Không thể tải xuống tệp <code>{escape_html(file_name)}</code> từ Telegram ({escape_html(err_msg)})."
        send_telegram_notification(msg, message_thread_id=current_thread_id)
        return

    # Trigger scan pipeline
    await process_telegram_scan_trigger(upload_uuid, current_thread_id)


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
