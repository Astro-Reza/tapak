"""Load local .env files for development (Vercel injects env vars itself).

Reads ``backend/.env`` then the repo-root ``.env``; variables already set in
the environment are never overridden. Lines are KEY=VALUE, optional quotes,
``#`` comments.
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
CANDIDATES = (BACKEND_DIR / ".env", BACKEND_DIR.parent / ".env")


def load_dotenv() -> None:
    for path in CANDIDATES:
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.removeprefix("export ").partition("=")
            key, value = key.strip(), value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            os.environ.setdefault(key, value)
