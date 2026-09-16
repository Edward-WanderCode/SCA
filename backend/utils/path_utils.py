"""Path utilities for normalizing file locations across scanners and reports."""

import re


def normalize_relative_path(file_path: str | None, repo_root: str | None = None) -> str:
    """
    Normalize any file path into a clean, relative path (relative to the repository root).

    Handles:
    - None / empty string
    - file:// or file:/// URL schemes
    - Windows backslashes (\\ -> /)
    - Duplicate slashes (// -> /)
    - Paths starting with repo_root or matching workspace/temp directories
    - Docker container mount prefixes (/src/...)
    - Leading ./ or /
    - Windows drive letter prefixes (e.g. D:/...)
    """
    if not file_path or not str(file_path).strip():
        return ""

    p = str(file_path).strip()

    # Remove file:// protocol
    if p.startswith("file:///"):
        p = p[8:]
    elif p.startswith("file://"):
        p = p[7:]

    # Normalize backslashes to forward slashes
    p = p.replace("\\\\", "/").replace("\\", "/")

    # Collapse consecutive slashes
    p = re.sub(r"/+", "/", p)

    # If explicit repo_root is provided, strip it
    if repo_root:
        rr = repo_root.replace("\\\\", "/").replace("\\", "/").rstrip("/")
        if p.lower().startswith(rr.lower() + "/"):
            p = p[len(rr) + 1:]
        elif p.lower() == rr.lower():
            return ""

    # Strip workspace / tmp / temp directories if present in path (e.g., .../workspace/<scan_id>/path/to/file)
    m = re.search(r"(?:^|/)(?:workspace|tmp|temp)/[^/]+/(.+)$", p, re.IGNORECASE)
    if m:
        p = m.group(1)

    # Docker container mount prefix /src/
    if p.startswith("/src/"):
        p = p[5:]
    elif p in ("/src", "src"):
        return ""

    # Strip leading ./ or /
    p = re.sub(r"^(?:\./|/)+", "", p)

    # If still an absolute Windows path (e.g. D:/some/path)
    if re.match(r"^[a-zA-Z]:/", p):
        p = re.sub(r"^[a-zA-Z]:/", "", p)

    # Clean leading dots and slashes again
    p = re.sub(r"^(?:\./|/)+", "", p)

    return p
