"""Verifier: precedence engine + reason codes + verdict assembly (B1/A3/A2).

Precedence per node, first match wins (build-execution-plan §3.3):
  MALFORMED -> SIGNATURE_INVALID -> UNKNOWN_ISSUER -> REPLAY_DETECTED
  -> BROKEN_LINK / CYCLE -> MASS_BALANCE
A failed node is excluded from the cost sum. CYCLE is fatal (whole chain NONE).
MASS_BALANCE and an invalid root both force NONE. Other integrity failures
degrade gracefully — the run still produces a usable answer + anomalies.
"""
from __future__ import annotations

import base64

from . import adapters, content, massbalance
from .chain import build_chain
from .models import (
    Anomaly,
    Designation,
    Reason,
    Status,
    VerificationResult,
)


class Verifier:
    def __init__(self, registry: dict):
        self.registry = registry

    def verify(self, chain) -> VerificationResult:
        order, has_cycle = chain.topo_walk()
        anomalies: list[Anomaly] = []

        if has_cycle:
            anomalies.append(Anomaly(Reason.CYCLE, chain.root_hash, "cycle detected in chain"))
            return VerificationResult(Designation.NONE, 0.0, 0, 0, {}, anomalies)

        # per-node integrity + structural, in precedence order
        seen_serial: dict[tuple[str, str], str] = {}
        for h in order:
            node = chain.by_hash[h]
            att = node.attestation

            pub, verified = adapters.resolve_key(att.supplier_id, self.registry)
            node.signer_known = pub is not None and verified
            if not node.signer_known:
                self._fail(node, Reason.UNKNOWN_ISSUER, anomalies,
                           f"supplier {att.supplier_id} not a verified issuer")
                continue

            msg = adapters.canonicalize(adapters.payload_dict(att))
            node.sig_valid = adapters.verify(msg, base64.b64decode(att.signature), pub)
            if not node.sig_valid:
                self._fail(node, Reason.SIGNATURE_INVALID, anomalies, "signature does not verify")
                continue

            key = (att.supplier_id, att.output.product_id)
            if key in seen_serial:
                self._fail(node, Reason.REPLAY_DETECTED, anomalies,
                           f"duplicate output serial {key}")
                continue
            seen_serial[key] = h

            missing = [ih for ih in node.input_hashes if ih not in chain.by_hash]
            if missing:
                self._fail(node, Reason.BROKEN_LINK, anomalies,
                           f"references missing input {missing[0]}")
                continue

        # mass-balance (after structural; hard reject)
        for h, detail in massbalance.check(chain).items():
            if h in order and chain.by_hash[h].status == Status.OK:
                self._fail(chain.by_hash[h], Reason.MASS_BALANCE, anomalies, detail)

        # costs over valid nodes
        valid = {h for h in order if chain.by_hash[h].status == Status.OK}
        total, canadian, by_country = content.attribute_costs(chain, valid)

        # verdict
        last_st = adapters.find_last_st(chain)
        last_st_in_ca = last_st is not None and last_st.attestation.work_country == "CA"
        designation = content.designate(total, canadian, last_st_in_ca)

        root = chain.by_hash.get(chain.root_hash)
        root_invalid = root is None or root.status != Status.OK
        mass_balance_hit = any(a.reason == Reason.MASS_BALANCE for a in anomalies)
        if root_invalid or mass_balance_hit:
            designation = Designation.NONE

        # advisory anomalies (no effect on verdict). Lit up once anomaly.py merges.
        try:
            from . import anomaly  # noqa: PLC0415
            anomalies.extend(anomaly.score(chain.by_hash.values()))
        except Exception:
            pass

        pct = canadian / total if total else 0.0
        return VerificationResult(designation, pct, total, canadian, by_country, anomalies)

    @staticmethod
    def _fail(node, reason: Reason, anomalies: list[Anomaly], detail: str) -> None:
        node.status = Status.INVALID
        node.reason = reason
        anomalies.append(Anomaly(reason, node.hash, detail))


def verify_root(store: dict[str, dict], registry: dict, root_hash: str) -> VerificationResult:
    atts = [adapters.attestation_from_dict(v) for v in store.values()]
    chain = build_chain(atts, root_hash)
    return Verifier(registry).verify(chain)


def anomaly_to_dict(a: Anomaly) -> dict:
    return {
        "reason": a.reason.value,
        "attestation_hash": a.attestation_hash,
        "detail": a.detail,
        "advisory": a.advisory,
    }


def result_to_dict(r: VerificationResult) -> dict:
    return {
        "designation": r.designation.value,
        "canadian_pct": r.canadian_pct,
        "total_cost_cents": r.total_cost_cents,
        "canadian_cost_cents": r.canadian_cost_cents,
        "cost_by_country": r.cost_by_country,
        "anomalies": [anomaly_to_dict(a) for a in r.anomalies],
    }
