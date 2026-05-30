"""SQLite-backed attestation store + append-only transparency log (P3.1).

Replaces the in-memory `STORE: dict` that previously lived in `main.py`. Two
tables:

  attestations(hash PK, wire_json, supplier_id, product_id, created_at)
  transparency_log(seq PK AUTOINC, attestation_hash FK, appended_at,
                   prev_chain, chain_hash)

`chain_hash = sha256(prev_chain || attestation_hash)` — a rolling chain that
commits each new entry to every previous one. Trivially tamper-evident; the
roadmap is a full Merkle tree but a rolling chain is enough for the demo
narrative ("each log entry includes a fingerprint of all prior entries").

Threading: one shared connection guarded by a `threading.Lock`. SQLite WAL mode
allows concurrent readers; the lock serialises writers. Fine at hackathon
scale; for production, swap to per-request connections.

Tests get an in-memory DB via `open_db(":memory:")` — see conftest.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
from pathlib import Path
from typing import Iterator


_SCHEMA = """
CREATE TABLE IF NOT EXISTS attestations (
    hash         TEXT PRIMARY KEY,
    wire_json    TEXT NOT NULL,
    supplier_id  TEXT NOT NULL,
    product_id   TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_att_supplier_product
    ON attestations(supplier_id, product_id);

CREATE TABLE IF NOT EXISTS transparency_log (
    seq               INTEGER PRIMARY KEY AUTOINCREMENT,
    attestation_hash  TEXT NOT NULL REFERENCES attestations(hash),
    appended_at       TEXT NOT NULL DEFAULT (datetime('now')),
    prev_chain        TEXT,
    chain_hash        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_log_hash
    ON transparency_log(attestation_hash);
"""


def _chain_hash(prev: str | None, leaf: str) -> str:
    """Rolling chain: sha256(prev_hex || leaf_hex). First entry: prev is empty."""
    h = hashlib.sha256()
    h.update((prev or "").encode())
    h.update(leaf.encode())
    return h.hexdigest()


class Store:
    """Thin wrapper around a SQLite connection. One per process."""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.lock = threading.Lock()

    # ---- attestations ------------------------------------------------------
    def insert_attestation(self, hash_: str, wire: dict) -> dict | None:
        """Insert (or no-op if already present). When an insert actually happens,
        a transparency-log entry is appended in the SAME transaction.

        Returns the log entry dict if appended, else None (already present)."""
        sid = wire.get("supplier_id", "")
        pid = (wire.get("output") or {}).get("product_id", "")
        wire_json = json.dumps(wire, separators=(",", ":"))
        with self.lock:
            cur = self.conn.cursor()
            cur.execute(
                "INSERT OR IGNORE INTO attestations (hash, wire_json, supplier_id, product_id) "
                "VALUES (?, ?, ?, ?)",
                (hash_, wire_json, sid, pid),
            )
            if cur.rowcount == 0:
                self.conn.commit()
                return None
            # Append to log
            cur.execute(
                "SELECT chain_hash FROM transparency_log ORDER BY seq DESC LIMIT 1"
            )
            row = cur.fetchone()
            prev = row[0] if row else None
            new_chain = _chain_hash(prev, hash_)
            cur.execute(
                "INSERT INTO transparency_log (attestation_hash, prev_chain, chain_hash) "
                "VALUES (?, ?, ?)",
                (hash_, prev, new_chain),
            )
            seq = cur.lastrowid
            self.conn.commit()
            return {"seq": seq, "prev_chain": prev, "chain_hash": new_chain}

    def get_attestation(self, hash_: str) -> dict | None:
        cur = self.conn.cursor()
        cur.execute("SELECT wire_json FROM attestations WHERE hash = ?", (hash_,))
        row = cur.fetchone()
        return json.loads(row[0]) if row else None

    def iter_attestations(self) -> Iterator[tuple[str, dict]]:
        cur = self.conn.cursor()
        for h, wire_json in cur.execute("SELECT hash, wire_json FROM attestations"):
            yield h, json.loads(wire_json)

    def count_attestations(self) -> int:
        cur = self.conn.cursor()
        cur.execute("SELECT COUNT(*) FROM attestations")
        return int(cur.fetchone()[0])

    # ---- transparency log --------------------------------------------------
    def log_head(self) -> dict | None:
        """Most recent log entry, or None if log is empty."""
        cur = self.conn.cursor()
        cur.execute(
            "SELECT seq, attestation_hash, appended_at, prev_chain, chain_hash "
            "FROM transparency_log ORDER BY seq DESC LIMIT 1"
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "seq": row[0], "attestation_hash": row[1], "appended_at": row[2],
            "prev_chain": row[3], "chain_hash": row[4],
        }

    def log_entry_for(self, hash_: str) -> dict | None:
        """Log entry for a given attestation hash (first inclusion)."""
        cur = self.conn.cursor()
        cur.execute(
            "SELECT seq, attestation_hash, appended_at, prev_chain, chain_hash "
            "FROM transparency_log WHERE attestation_hash = ? ORDER BY seq ASC LIMIT 1",
            (hash_,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "seq": row[0], "attestation_hash": row[1], "appended_at": row[2],
            "prev_chain": row[3], "chain_hash": row[4],
        }

    def verify_log_integrity(self) -> tuple[bool, str | None]:
        """Walk the entire log and recompute every chain_hash. Returns
        (ok, error). Used by tests and the optional /log/verify endpoint."""
        cur = self.conn.cursor()
        prev = None
        for seq, leaf, recorded in cur.execute(
            "SELECT seq, attestation_hash, chain_hash FROM transparency_log ORDER BY seq ASC"
        ):
            expected = _chain_hash(prev, leaf)
            if expected != recorded:
                return False, f"seq={seq} expected={expected} got={recorded}"
            prev = recorded
        return True, None


def open_db(path: str | Path) -> Store:
    """Open (or create) the SQLite DB and apply the schema. `":memory:"` works
    for tests. WAL mode for concurrent reads; synchronous=NORMAL for hackathon
    durability."""
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        # WAL is unsupported for in-memory DBs; ignore the resulting error.
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
    except sqlite3.DatabaseError:
        pass
    conn.executescript(_SCHEMA)
    conn.commit()
    return Store(conn)
