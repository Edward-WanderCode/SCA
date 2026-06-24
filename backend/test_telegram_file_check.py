import sys
import os
import zipfile

# Add backend directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from pathlib import Path

# Create a mock zip file (not encrypted)
temp_zip = Path("backend/temp_test_no_pass.zip")
with zipfile.ZipFile(temp_zip, "w") as z:
    z.writestr("test.py", "print('hello')")

# Create a mock zip file (encrypted)
# Note: Python's zipfile can't write encrypted files easily, but we can read it to verify.
# Let's test with no pass zip first.
print("=== ZIP VALIDATION TEST ===")
print(f"Testing zip file: {temp_zip}")

try:
    is_encrypted = False
    with zipfile.ZipFile(temp_zip) as zf:
        for zinfo in zf.infolist():
            if zinfo.flag_bits & 0x1:
                is_encrypted = True
                break
    print(f"Is encrypted: {is_encrypted} (Expected: False)")
    assert is_encrypted is False
finally:
    if temp_zip.exists():
        temp_zip.unlink()

# Test supported extensions checking logic
supported_extensions = {
    ".py", ".js", ".ts", ".go", ".java", ".c", ".cpp", ".h", ".hpp",
    ".cs", ".php", ".rb", ".json", ".yml", ".yaml", ".rs", ".kt", ".swift",
    ".tsx", ".jsx"
}

def check_file(filename: str):
    is_zip = filename.lower().endswith(".zip")
    file_ext = Path(filename).suffix.lower()
    if is_zip or file_ext in supported_extensions:
        return True
    return False

print("\n=== EXTENSION VALIDATION TEST ===")
test_cases = {
    "main.py": True,
    "index.js": True,
    "App.tsx": True,
    "photo.png": False,
    "document.docx": False,
    "source.zip": True,
    "main.go": True
}

for name, expected in test_cases.items():
    res = check_file(name)
    print(f"File: {name:15} | Result: {res:5} | Expected: {expected:5} | Match: {res == expected}")
    assert res == expected

print("\nALL TESTS PASSED SUCCESSFULLY!")
