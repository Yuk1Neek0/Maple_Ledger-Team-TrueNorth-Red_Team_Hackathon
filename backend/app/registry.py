"""Load the supplier registry (mock now, real file swapped on the day).

File shape: { supplier_id: { "public_key": <hex raw 32-byte ed25519>, "verified": bool } }
Returns an in-memory map with the key already parsed into an Ed25519PublicKey.
"""
from __future__ import annotations

import json
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

_DEFAULT = Path(__file__).resolve().parents[2] / "data" / "registry.json"


def load_registry(path: Path | str | None = None) -> dict[str, dict]:
    p = Path(path) if path else _DEFAULT
    raw = json.loads(p.read_text(encoding="utf-8"))
    out: dict[str, dict] = {}
    for supplier_id, entry in raw.items():
        pub = Ed25519PublicKey.from_public_bytes(bytes.fromhex(entry["public_key"]))
        out[supplier_id] = {"public_key": pub, "verified": bool(entry["verified"])}
    return out
