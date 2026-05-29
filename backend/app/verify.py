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

from . import adapters, content, criticality, massbalance
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
            result = VerificationResult(Designation.NONE, 0.0, 0, 0, {}, anomalies)
            result.graph = chain_to_graph(chain)
            return result

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

            if len(node.input_hashes) != len(set(node.input_hashes)):
                self._fail(node, Reason.BROKEN_LINK, anomalies,
                           "duplicate input reference")
                continue

        # temporal monotonicity (advisory): a consumer must not predate its input
        for h in order:
            node = chain.by_hash[h]
            for ref in node.attestation.inputs:
                p = chain.by_hash.get(ref.attestation_hash)
                if p is not None and node.attestation.timestamp < p.attestation.timestamp:
                    anomalies.append(Anomaly(
                        Reason.TEMPORAL_INVERSION, h,
                        f"timestamp {node.attestation.timestamp} precedes input "
                        f"{p.attestation.timestamp}", advisory=True))

        # mass-balance (after structural; hard reject)
        for h, detail in massbalance.check(chain).items():
            if h in order and chain.by_hash[h].status == Status.OK:
                self._fail(chain.by_hash[h], Reason.MASS_BALANCE, anomalies, detail)

        # costs over valid nodes
        valid = {h for h in order if chain.by_hash[h].status == Status.OK}
        total, canadian, by_country = content.attribute_costs(chain, valid)

        # per-node subtree % (display only; never feeds the verdict)
        for h, p in content.subtree_percents(chain, valid).items():
            chain.by_hash[h].subtree_percent = p

        # advisory criticality overlay (display only; never feeds the verdict)
        for node in chain.by_hash.values():
            node.annotations["criticality"] = criticality.classify(node)

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
        result = VerificationResult(designation, pct, total, canadian, by_country, anomalies)
        result.graph = chain_to_graph(chain)
        return result

    @staticmethod
    def _fail(node, reason: Reason, anomalies: list[Anomaly], detail: str) -> None:
        node.status = Status.INVALID
        node.reason = reason
        anomalies.append(Anomaly(reason, node.hash, detail))


def verify_root(store: dict[str, dict], registry: dict, root_hash: str) -> VerificationResult:
    # The store is a shared pool of every attestation ever submitted. Scope the
    # chain to what is reachable from this root, else mass-balance / anomaly /
    # cost would span unrelated products (e.g. a shared raw-material lot would
    # look over-consumed across chains).
    atts = []
    for v in store.values():
        try:
            atts.append(adapters.attestation_from_dict(v))
        except Exception:
            continue  # skip malformed/unparseable entries — degrade gracefully
    full = build_chain(atts, root_hash)
    reachable = full.reachable()
    scoped = [full.by_hash[h].attestation for h in reachable]
    chain = build_chain(scoped, root_hash)
    return Verifier(registry).verify(chain)


def anomaly_to_dict(a: Anomaly) -> dict:
    return {
        "reason": a.reason.value,
        "attestation_hash": a.attestation_hash,
        "detail": a.detail,
        "advisory": a.advisory,
    }


def chain_to_graph(chain) -> dict:
    """Serialize the verified chain topology for the UI (WS2.1).

    Edge direction is input -> consumer. Node `status` mirrors the reason enum
    one-to-one (OK / INVALID). This is display data only; it never feeds the
    verdict. The frontend renders any DAG shape against this.
    """
    nodes, edges = [], []
    for h, node in chain.by_hash.items():
        att = node.attestation
        nodes.append({
            "id": h,
            "label": f"{att.output.product_id}\n{att.supplier_id} · {att.work_country}",
            "supplier_id": att.supplier_id,
            "product_id": att.output.product_id,
            "country": att.work_country,
            "status": node.status.value,
            "reason": node.reason.value if node.reason else None,
            "subtree_percent": round(node.subtree_percent, 4),
            "criticality": node.annotations.get("criticality"),
        })
        for ih in node.input_hashes:
            if ih in chain.by_hash:
                edges.append({"source": ih, "target": h})
    return {"nodes": nodes, "edges": edges}


def result_to_dict(r: VerificationResult) -> dict:
    return {
        "designation": r.designation.value,
        "canadian_pct": r.canadian_pct,
        "total_cost_cents": r.total_cost_cents,
        "canadian_cost_cents": r.canadian_cost_cents,
        "cost_by_country": r.cost_by_country,
        "anomalies": [anomaly_to_dict(a) for a in r.anomalies],
        "graph": r.graph,
    }
