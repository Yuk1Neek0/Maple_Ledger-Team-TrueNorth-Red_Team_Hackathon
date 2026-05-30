"""Load the supplier registry (real spec format; multi-shape tolerant).

Real shape (provenance-kit/registry/supplier_public_keys.json):
    { "version": "1.0", "keys": { "sup-0001": "<base64 ed25519 pubkey>", ... } }

Returns an in-memory map { supplier_id: {"public_key": <base64 str>, "verified": bool} }.
The public key stays a base64 string — that is what reference_lib.verify_attestation
consumes. "unknown issuer" = a supplier_id absent from the map.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
_REAL = _REPO / "provenance-kit" / "registry" / "supplier_public_keys.json"
_LEGACY = _REPO / "data" / "registry.json"


def _default_path() -> Path:
    """Env override, then container mount, then the vendored real registry,
    then the legacy mock (kept only so old dev flows don't hard-crash)."""
    env = os.environ.get("ML_REGISTRY_PATH")
    if env:
        return Path(env)
    container = Path("/registry/supplier_public_keys.json")
    if container.exists():
        return container
    if _REAL.exists():
        return _REAL
    return _LEGACY


def _normalize(raw) -> dict[str, dict]:
    """Normalize plausible registry shapes to
    { id: {"public_key": <b64 or hex str>, "verified": bool} } (04 §5).

      - { "version": ..., "keys": { id: "<b64>" } }          (REAL spec)
      - { id: {public_key|publicKey, verified} }              (legacy mock)
      - [ {issuerId|supplier_id|id, publicKey|public_key, verified} ]
      - { "issuers": { ...same as the dict form... } }
    """
    # REAL spec shape: flat {keys: {id: b64}} — no `verified` concept (all trusted).
    if isinstance(raw, dict) and isinstance(raw.get("keys"), dict):
        return {sid: {"public_key": k, "verified": True} for sid, k in raw["keys"].items()}

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
    p = Path(path) if path else _default_path()
    raw = json.loads(p.read_text(encoding="utf-8"))
    return _normalize(raw)
