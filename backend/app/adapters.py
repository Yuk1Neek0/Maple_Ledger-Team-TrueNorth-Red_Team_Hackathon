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

from . import spec
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


def _jcs_bytes(obj: dict) -> bytes:
    """RFC-8785-style canonical JSON bytes: sorted keys, compact, UTF-8."""
    return json.dumps(
        obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def _pae(payload_type: str, body: bytes) -> bytes:
    """DSSE Pre-Authentication Encoding — the exact bytes signed under a DSSE
    envelope: b"DSSEv1" SP LEN(type) SP type SP LEN(body) SP body (lengths ASCII)."""
    t = payload_type.encode("utf-8")
    return b"DSSEv1 %d %s %d %s" % (len(t), t, len(body), body)


def canonicalize(obj: dict) -> bytes:
    """The exact bytes that get signed/verified. Selectable via spec.SERIALIZATION:
    "jcs" (default, RFC-8785-style) or "dsse" (DSSE/PAE over the JCS body — the
    likely event-day envelope). Day-of switch is one constant in spec.py."""
    body = _jcs_bytes(obj)
    if spec.SERIALIZATION == "dsse":
        return _pae(spec.DSSE_PAYLOAD_TYPE, body)
    return body


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


def _st_by_flag(chain):
    """Nearest-to-root node whose is_substantial_transformation flag is set."""
    root = chain.by_hash.get(chain.root_hash)
    if root is not None and root.attestation.is_substantial_transformation:
        return root
    seen, queue = set(), [chain.root_hash]   # BFS root -> leaves; first flagged wins
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


def _st_root(chain):
    """Spec variant: the final assembler (root) is always the last ST point."""
    return chain.by_hash.get(chain.root_hash)


def _st_by_activity(chain):
    """Spec variant: nearest-to-root node whose overlay `activity` is an ST
    activity. The day-of adapter populates node.annotations['activity']."""
    seen, queue = set(), [chain.root_hash]
    while queue:
        h = queue.pop(0)
        if h in seen:
            continue
        seen.add(h)
        node = chain.by_hash.get(h)
        if node is None:
            continue
        if node.annotations.get("activity") in spec.ST_ACTIVITIES:
            return node
        queue.extend(node.input_hashes)
    return chain.by_hash.get(chain.root_hash)


_ST_STRATEGIES = {"flag": _st_by_flag, "root": _st_root, "activity": _st_by_activity}


def find_last_st(chain) -> "object | None":
    """Node of the last substantial transformation — the single biggest event-day
    unknown. Strategy selectable via spec.ST_STRATEGY (default 'flag'). SWAP on
    the day: confirm the rule, set the constant; the variants are pre-staged."""
    return _ST_STRATEGIES.get(spec.ST_STRATEGY, _st_by_flag)(chain)
