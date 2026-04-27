#!/usr/bin/env python3
"""
add_run.py
==========
Adds a new flight CSV to your tracker.

Usage:
    python3 add_run.py path/to/flight_results.csv [--label "Optional label"]

What it does:
1. Copies the CSV into data/ with today's date as filename (e.g. 2026-05-10.csv)
2. Updates data/manifest.json to include the new run
3. Reports what changed

Then commit + push to GitHub and your site updates automatically.
"""

import argparse
import csv
import json
import shutil
import sys
from datetime import date
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
DATA_DIR   = SCRIPT_DIR / "data"
MANIFEST   = DATA_DIR / "manifest.json"


def main():
    parser = argparse.ArgumentParser(description="Add a new flight scan to the tracker.")
    parser.add_argument("csv_path", help="Path to the flight_results.csv from kayak_finder.py")
    parser.add_argument("--label", default="", help="Optional label for this run (e.g. 'after fare drop')")
    parser.add_argument("--date", default=None, help="Override scan date (YYYY-MM-DD; defaults to today)")
    args = parser.parse_args()

    src = Path(args.csv_path)
    if not src.exists():
        print(f"ERROR: {src} does not exist")
        sys.exit(1)

    # Validate it looks like a flight CSV
    with open(src, newline="") as f:
        reader = csv.DictReader(f)
        if "price_usd" not in (reader.fieldnames or []):
            print(f"ERROR: {src} doesn't look like a flight_results CSV (missing price_usd column)")
            sys.exit(1)
        row_count = sum(1 for _ in reader)

    if row_count == 0:
        print(f"ERROR: {src} has no data rows")
        sys.exit(1)

    # Resolve scan date
    scan_date = args.date or date.today().isoformat()
    try:
        date.fromisoformat(scan_date)
    except ValueError:
        print(f"ERROR: --date must be YYYY-MM-DD, got: {scan_date}")
        sys.exit(1)

    # Ensure data dir exists
    DATA_DIR.mkdir(exist_ok=True)

    # Copy file
    dst = DATA_DIR / f"{scan_date}.csv"
    if dst.exists():
        confirm = input(f"⚠  {dst.name} already exists. Overwrite? [y/N] ")
        if confirm.lower() != "y":
            print("Aborted.")
            sys.exit(1)
    shutil.copy2(src, dst)

    # Update manifest
    if MANIFEST.exists():
        with open(MANIFEST) as f:
            manifest = json.load(f)
    else:
        manifest = {"runs": []}

    # Remove any existing entry for this date
    manifest["runs"] = [r for r in manifest["runs"] if r["date"] != scan_date]

    manifest["runs"].append({
        "date": scan_date,
        "file": dst.name,
        "label": args.label,
    })

    # Sort newest first
    manifest["runs"].sort(key=lambda r: r["date"], reverse=True)

    with open(MANIFEST, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    # Report
    print(f"✓  Added scan: {scan_date}")
    print(f"   File:   data/{dst.name}  ({row_count} itineraries)")
    if args.label:
        print(f"   Label:  {args.label}")
    print(f"   Total scans tracked: {len(manifest['runs'])}")
    print()
    print("Next steps:")
    print("  git add data/")
    print(f"  git commit -m \"Add scan: {scan_date}\"")
    print("  git push")


if __name__ == "__main__":
    main()
