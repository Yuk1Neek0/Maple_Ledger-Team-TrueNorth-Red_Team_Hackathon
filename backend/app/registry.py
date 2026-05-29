"""Load the supplier registry (mock now, real file swapped on the day).

File shape: { supplier_id: { "public_key": <hex raw 32-byte ed25519>, "verified": bool } }
Returns an in-memory map with the key already parsed into an Ed25519PublicKey.
"""
from __future__ import annotations

import json
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

_DEFAULT = Path(__file__).resolve().parents[2] / "data" / "registry.json"


def _normalize(raw) -> dict[str, dict]:
    """Accept several plausible registry shapes and normalize to
    { id: {"public_key": <hex>, "verified": bool} } (WS4.5). Day-of registry
    format is an unknown; this absorbs the common variants.

      - { id: {public_key|publicKey, verified} }            (current)
      - [ {issuerId|supplier_id|id, publicKey|public_key, verified} ]
      - { "issuers": { ...same as the dict form... } }
    """
    if isinstance(raw, dict) and isinstance(raw.get("issuers"), (dict, list)):
        raw = raw["issuers"]
    out: dict[str, dict] = {}
    if isinstance(raw, list):
        for e in raw:
            sid = e.get("issuerId") or e.get("supplier_id") or e.get("id")
            out[sid] = {"public_key": e.get("publicKey") or e.get("public_key"),
                        "verified": bool(e.get("verified", False))}
    elif isinstance(raw, dict):
        for sid, e in raw.items():
            out[sid] = {"public_key": e.get("publicKey") or e.get("public_key"),
                        "verified": bool(e.get("verified", False))}
    return out


def load_registry(path: Path | str | None = None) -> dict[str, dict]:
    p = Path(path) if path else _DEFAULT
    raw = json.loads(p.read_text(encoding="utf-8"))
    out: dict[str, dict] = {}
    for supplier_id, entry in _normalize(raw).items():
        pub = Ed25519PublicKey.from_public_bytes(bytes.fromhex(entry["public_key"]))
        out[supplier_id] = {"public_key": pub, "verified": entry["verified"]}
    return out
