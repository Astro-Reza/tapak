#!/usr/bin/env python3
"""CLI utility to create and seed the Marswalk Hub database.

    python init_hub_db.py                 # local SQLite file (marswalk_hub.db)
    python init_hub_db.py --turso         # Turso (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN)
    python init_hub_db.py --flush-cache   # only clear the Upstash Hub cache

Env vars are read from the shell, backend/.env or the repo-root .env.
Seeding upserts the dummy data; it also clears the Redis catalogue cache.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add backend directory to sys.path so marswalk_api can be imported
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from marswalk_api.cache import get_cache
from marswalk_api.env import load_dotenv
from marswalk_api.hub_db import (
    DEFAULT_DB_PATH,
    get_checklist_with_blocks,
    get_hold_criteria,
    get_presets,
    get_turso,
    init_db,
)


def main():
    parser = argparse.ArgumentParser(description="Initialize and seed Marswalk Hub database.")
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB_PATH,
        help=f"Target SQLite database path (default: {DEFAULT_DB_PATH})",
    )
    parser.add_argument(
        "--turso",
        action="store_true",
        help="Initialise the Turso database from TURSO_DATABASE_URL instead of a local file",
    )
    parser.add_argument(
        "--no-seed",
        action="store_true",
        help="Create tables only without loading seed dummy data",
    )
    parser.add_argument(
        "--flush-cache",
        action="store_true",
        help="Only delete the Hub keys in Upstash Redis, then exit",
    )
    args = parser.parse_args()
    load_dotenv()

    if args.flush_cache:
        cache = get_cache()
        if not cache.enabled:
            sys.exit("[!] KV_REST_API_URL / KV_REST_API_TOKEN not set")
        print(f"[+] Deleted {cache.invalidate()} cached Hub keys")
        return

    if args.turso:
        conn = get_turso()
        print("[*] Initializing Turso database")
        init_db(seed=not args.no_seed, conn=conn)
    else:
        print(f"[*] Initializing database at: {args.db}")
        conn = init_db(db_path=args.db, seed=not args.no_seed)

    # Print summary statistics
    presets = get_presets(conn)
    lists = {cl: get_checklist_with_blocks(conn, cl, "EVA-07") for cl in ("pre", "during", "post")}
    hold = get_hold_criteria(conn)

    print("\n[+] Database initialized successfully!")
    print(f"    - Mission Presets: {len(presets)}")
    for p in presets:
        print(f"      • {p['id']}: {p['name']} (Sol {p['sol']}, {p['mode']}, {p['status']})")
    for name, cl in lists.items():
        if cl:
            count = sum(len(b["items"]) for b in cl["blocks"])
            print(f"    - {cl['title']}: {count} items across {len(cl['blocks'])} blocks")
    print(f"    - Hold Criteria: {len(hold)} criteria")
    print(f"    - Redis cache: {'on' if get_cache().enabled else 'off'}")


if __name__ == "__main__":
    main()
