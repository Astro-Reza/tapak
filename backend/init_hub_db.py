#!/usr/bin/env python3
"""CLI utility to create and seed the Marswalk Hub SQLite database."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add backend directory to sys.path so marswalk_api can be imported
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from marswalk_api.hub_db import DEFAULT_DB_PATH, init_db, get_presets, get_checklist_with_blocks, get_hold_criteria


def main():
    parser = argparse.ArgumentParser(description="Initialize and seed Marswalk Hub database.")
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB_PATH,
        help=f"Target SQLite database path (default: {DEFAULT_DB_PATH})",
    )
    parser.add_argument(
        "--no-seed",
        action="store_true",
        help="Create tables only without loading seed dummy data",
    )
    args = parser.parse_args()

    print(f"[*] Initializing database at: {args.db}")
    conn = init_db(db_path=args.db, seed=not args.no_seed)

    # Print summary statistics
    presets = get_presets(conn)
    pre = get_checklist_with_blocks(conn, "pre", "EVA-07")
    during = get_checklist_with_blocks(conn, "during", "EVA-07")
    post = get_checklist_with_blocks(conn, "post", "EVA-07")
    hold = get_hold_criteria(conn)

    pre_count = sum(len(b["items"]) for b in pre["blocks"]) if pre else 0
    during_count = sum(len(b["items"]) for b in during["blocks"]) if during else 0
    post_count = sum(len(b["items"]) for b in post["blocks"]) if post else 0

    print("\n[+] Database initialized successfully!")
    print(f"    - Mission Presets: {len(presets)}")
    for p in presets:
        print(f"      • {p['id']}: {p['name']} (Sol {p['sol']}, {p['mode']}, {p['status']})")
    print(f"    - Pre-EVA checklist: {pre_count} items across {len(pre['blocks'])} blocks")
    print(f"    - During-EVA checklist: {during_count} items across {len(during['blocks'])} blocks")
    print(f"    - Post-EVA checklist: {post_count} items across {len(post['blocks'])} blocks")
    print(f"    - Hold Criteria: {len(hold)} criteria")
    print("\nReady for backend wiring!")


if __name__ == "__main__":
    main()
