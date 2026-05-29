"""Seed the running backend with all fixture chains for manual UI testing.

POSTs every fixture's attestations into the backend's in-memory store and prints
a table of root hashes to paste into the purchaser UI (http://localhost:5173/?mock=0).

IMPORTANT: the store is IN-MEMORY (no database). Seeded data lives only until the
verifier-backend container restarts/recreates — then it's gone. Re-run this script
to re-seed; it takes about a second.

Usage: python scripts/seed.py
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8000"
FIX = Path(__file__).resolve().parents[1] / "backend" / "tests" / "fixtures"


def post(path, body):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    return json.loads(urllib.request.urlopen(req, timeout=10).read())


def main():
    try:
        urllib.request.urlopen(BASE + "/health", timeout=3)
    except Exception:
        print(f"Backend not reachable at {BASE} — run `docker compose up -d` first.")
        sys.exit(1)

    rows = []
    for f in sorted(FIX.glob("*.json")):
        fx = json.loads(f.read_text(encoding="utf-8"))
        for att in fx["attestations"]:
            post("/attestations", att)
        exp = fx.get("expected", {})
        label = exp.get("designation") or exp.get("reason") or "-"
        rows.append((f.stem, fx["root_hash"], label))

    w = max(len(r[0]) for r in rows)
    print(f"\nSeeded {len(rows)} chains into {BASE}  (in-memory — gone on backend restart)\n")
    print(f"{'fixture'.ljust(w)}  root_hash{' ' * 56} demonstrates")
    print(f"{'-' * w}  {'-' * 64} -----------")
    for name, root, label in rows:
        print(f"{name.ljust(w)}  {root}  {label}")
    print(f"\nPaste any root_hash into the purchaser UI: http://localhost:5173/?mock=0")


if __name__ == "__main__":
    main()
