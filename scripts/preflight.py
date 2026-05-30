"""Event-day preflight — verify every adapter is in a known state (P1.2).

Run at kickoff after dropping in the real spec. Prints which constant is active
for each of the 7 seams, then asserts JCS bytes match the canonical self-test
value and that a sample chain round-trips through canonicalize + Ed25519.

Exits non-zero on the first mismatch — quicker than chasing a bad signature
through the verifier later.

    python scripts/preflight.py
"""
from __future__ import annotations

import base64
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey  # noqa: E402

from app import adapters, spec  # noqa: E402
from app.models import Attestation, InputRef, Output  # noqa: E402

EXPECTED_JCS = (
    '{"inputs":[{"attestation_hash":"<hex>","quantity_used":1}],'
    '"is_substantial_transformation":false,'
    '"labour_cents":200,"materials_cents":500,'
    '"output":{"product_id":"raw_aluminum","quantity":1,"unit":"kg"},'
    '"supplier_id":"SUP-ALU",'
    '"timestamp":"2026-05-01T08:00:00Z","work_country":"CA"}'
)

SAMPLE_PAYLOAD = {
    "supplier_id": "SUP-ALU",
    "output": {"product_id": "raw_aluminum", "quantity": 1, "unit": "kg"},
    "inputs": [{"attestation_hash": "<hex>", "quantity_used": 1}],
    "materials_cents": 500, "labour_cents": 200,
    "work_country": "CA", "is_substantial_transformation": False,
    "timestamp": "2026-05-01T08:00:00Z",
}


def _row(label: str, value: str, ok: bool = True) -> None:
    mark = "OK " if ok else "FAIL"
    print(f"  [{mark}] {label:32} {value}")


def main() -> int:
    fails = 0

    print("\nMaple Ledger — adapter preflight\n" + "=" * 48)

    # 1. Active spec constants ------------------------------------------------
    print("\n[1] active variant selectors (backend/app/spec.py)")
    _row("SERIALIZATION", spec.SERIALIZATION)
    _row("DSSE_PAYLOAD_TYPE", spec.DSSE_PAYLOAD_TYPE)
    _row("ST_STRATEGY", spec.ST_STRATEGY)
    _row("ST_ACTIVITIES", str(sorted(spec.ST_ACTIVITIES)))
    _row("COST_FLOW", spec.COST_FLOW)
    _row("REPLAY_RULE", spec.REPLAY_RULE)

    # 2. Canonical bytes parity ----------------------------------------------
    print("\n[2] canonicalize(payload) byte-parity check")
    body_bytes = adapters._jcs_bytes(SAMPLE_PAYLOAD)
    body_str = body_bytes.decode("utf-8")
    if body_str == EXPECTED_JCS:
        _row("JCS body matches expected", body_str[:64] + "...")
    else:
        fails += 1
        _row("JCS body MISMATCH", "see below", ok=False)
        print(f"      expected: {EXPECTED_JCS}")
        print(f"      actual:   {body_str}")

    # 3. End-to-end: canonicalize -> sign -> verify --------------------------
    print("\n[3] sign + verify round-trip")
    priv = Ed25519PrivateKey.generate()
    msg = adapters.canonicalize(SAMPLE_PAYLOAD)
    sig = priv.sign(msg)
    ok = adapters.verify(msg, sig, priv.public_key())
    if ok:
        _row(f"Ed25519 over {spec.SERIALIZATION!r} verifies", "ok")
    else:
        fails += 1
        _row(f"Ed25519 over {spec.SERIALIZATION!r} verify failed", "see code", ok=False)

    # 4. compute_hash determinism --------------------------------------------
    print("\n[4] compute_hash determinism")
    att = Attestation(
        supplier_id="SUP-ALU",
        output=Output("raw_aluminum", 1, "kg"),
        inputs=(InputRef("<hex>", 1),),
        materials_cents=500, labour_cents=200,
        work_country="CA", is_substantial_transformation=False,
        timestamp="2026-05-01T08:00:00Z", signature="",
    )
    h1 = adapters.compute_hash(att)
    h2 = adapters.compute_hash(att)
    expected_sha = hashlib.sha256(adapters._jcs_bytes(SAMPLE_PAYLOAD)).hexdigest()
    if h1 == h2 == expected_sha and spec.SERIALIZATION == "jcs":
        _row("compute_hash stable + matches sha256(JCS)", h1[:24] + "...")
    elif h1 == h2:
        _row(f"compute_hash stable under SERIALIZATION={spec.SERIALIZATION}",
             h1[:24] + "...")
    else:
        fails += 1
        _row("compute_hash drift", f"{h1} vs {h2}", ok=False)

    # 5. attestation_from_dict trip-through ----------------------------------
    print("\n[5] attestation_from_dict trip-through")
    wire = {**SAMPLE_PAYLOAD, "signature": base64.b64encode(sig).decode()}
    try:
        parsed = adapters.attestation_from_dict(wire)
        assert parsed.supplier_id == "SUP-ALU"
        _row("wire dict -> Attestation", "ok")
    except Exception as e:
        fails += 1
        _row("wire dict -> Attestation FAILED", str(e), ok=False)

    # 6. replay_key reflects current rule ------------------------------------
    print("\n[6] replay_key under current REPLAY_RULE")
    key = adapters.replay_key(parsed)
    _row(f"replay_key (rule={spec.REPLAY_RULE!r})", repr(key))

    print()
    print("=" * 48)
    if fails:
        print(f"PREFLIGHT FAILED: {fails} check(s) did not pass.")
        return 1
    print("PREFLIGHT OK — adapters are consistent. Safe to run scripts/run_chain.py.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
