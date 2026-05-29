"""The six adapter seams (build-execution-plan §3.2).

These are the ONLY place the event-day spec touches our code. Mock bodies now;
swap the insides (never the signatures) at kickoff. Also holds the shared
canonicalization + hashing helpers so the backend and the mock signer agree
byte-for-byte on what gets signed.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import jsonschema
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from .models import Attestation, InputRef, Output

_SCHEMA_PATH = Path(__file__).resolve().parents[2] / "schema" / "attestation.schema.json"
_schema_cache: dict | None = None


# ---- shared serialization (NOT a seam; both signer and verifier use it) ----
def payload_dict(att: Attestation) -> dict[str, Any]:
    """The signed payload: the attestation minus its signature."""
    return {
        "supplier_id": att.supplier_id,
        "output": {
            "product_id": att.output.product_id,
            "quantity": att.output.quantity,
            "unit": att.output.unit,
        },
        "inputs": [
            {"attestation_hash": i.attestation_hash, "quantity_used": i.quantity_used}
            for i in att.inputs
        ],
        "materials_cents": att.materials_cents,
        "labour_cents": att.labour_cents,
        "work_country": att.work_country,
        "is_substantial_transformation": att.is_substantial_transformation,
        "timestamp": att.timestamp,
    }


def compute_hash(att: Attestation) -> str:
    """attestation_id = hex(SHA-256(canonicalize(payload)))  (DESIGN §2)."""
    return hashlib.sha256(canonicalize(payload_dict(att))).hexdigest()


def attestation_from_dict(obj: dict[str, Any]) -> Attestation:
    """Wire dict -> internal Attestation. MOCK shape; swap on the day."""
    out = obj["output"]
    return Attestation(
        supplier_id=obj["supplier_id"],
        output=Output(out["product_id"], int(out["quantity"]), out["unit"]),
        inputs=tuple(
            InputRef(i["attestation_hash"], int(i["quantity_used"]))
            for i in obj.get("inputs", [])
        ),
        materials_cents=int(obj["materials_cents"]),
        labour_cents=int(obj["labour_cents"]),
        work_country=obj["work_country"],
        is_substantial_transformation=bool(obj["is_substantial_transformation"]),
        timestamp=obj["timestamp"],
        signature=obj["signature"],
    )


# ---- the six seams ----
def validate(obj: dict) -> tuple[bool, str | None]:
    """JSON-Schema check against schema/attestation.schema.json."""
    global _schema_cache
    if _schema_cache is None:
        _schema_cache = json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))
    try:
        jsonschema.validate(obj, _schema_cache)
        return True, None
    except jsonschema.ValidationError as e:
        return False, f"MALFORMED: {e.message}"


def canonicalize(obj: dict) -> bytes:
    """Deterministic bytes of the payload. MOCK: RFC-8785-style sorted-key JSON.
    SWAP on the day: DSSE/PAE if the reference library uses it."""
    return json.dumps(
        obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def verify(message: bytes, signature: bytes, public_key: Ed25519PublicKey) -> bool:
    """Ed25519 verify via pyca/cryptography.
    SWAP on the day: call the provided reference library."""
    try:
        public_key.verify(signature, message)
        return True
    except InvalidSignature:
        return False


def resolve_key(supplier_id: str, registry: dict) -> tuple[Ed25519PublicKey | None, bool]:
    """Registry lookup -> (public_key, verified). SWAP on the day: real registry format."""
    entry = registry.get(supplier_id)
    if entry is None:
        return None, False
    return entry["public_key"], bool(entry["verified"])


def get_costs(att: Attestation) -> tuple[int, int, str]:
    """(materials_cents, labour_cents, work_country). MOCK: read fields directly.
    SWAP on the day: real cost fields + the cost-flow/partial-consumption rule."""
    return att.materials_cents, att.labour_cents, att.work_country


def find_last_st(chain) -> "object | None":
    """Node of the last substantial transformation. MOCK: the root if its flag is
    set, else the flagged node nearest the root. SWAP on the day: spec's ST rule."""
    root = chain.by_hash.get(chain.root_hash)
    if root is not None and root.attestation.is_substantial_transformation:
        return root
    # BFS from root toward leaves; first flagged node wins.
    seen, queue = set(), [chain.root_hash]
    while queue:
        h = queue.pop(0)
        if h in seen:
            continue
        seen.add(h)
        node = chain.by_hash.get(h)
        if node is None:
            continue
        if node.attestation.is_substantial_transformation:
            return node
        queue.extend(node.input_hashes)
    return root
