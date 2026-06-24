import sys
import os
import asyncio
from pathlib import Path

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import logging
logging.basicConfig(level=logging.INFO)

from utils.telegram_bot import handle_document_upload
from unittest.mock import patch

# Mock download_telegram_file to skip downloading, as the file already exists
async def mock_download(file_id, dest_path):
    print(f"Mock download: file already exists? {dest_path.exists()}")
    return dest_path.exists()

# Mock uuid.uuid4 to return the UUID of the already downloaded file
class MockUUID:
    def __init__(self, val):
        self.val = val
    def __str__(self):
        return self.val

def mock_uuid():
    return MockUUID("8396d9df-62ba-46d3-a075-b2010954bca1")

async def main():
    message = {
        "message_thread_id": 306,
        "document": {
            "file_id": "mock_id",
            "file_name": "HCCD.Source_fix_20260622.zip",
            "file_size": 15640906
        }
    }
    
    with patch("utils.telegram_bot.download_telegram_file", side_effect=mock_download), \
         patch("uuid.uuid4", side_effect=mock_uuid):
        print("Running handle_document_upload...")
        await handle_document_upload(message)
        print("Done running handle_document_upload.")

if __name__ == "__main__":
    asyncio.run(main())
