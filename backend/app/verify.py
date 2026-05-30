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
from .detectors import VerifyContext, run_detectors
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
        order, cycle_members = chain.topo_walk()
        anomalies: list[Anomaly] = []

        if cycle_members:
            # Detail enumerates every node that couldn't be topologically ordered
            # — invaluable for debugging chains the spec ingested. The root-hash
            # anomaly stays on the root so the existing UI keeps lighting it up.
            preview = ", ".join(m[:12] for m in cycle_members[:6])
            extra = f" (+{len(cycle_members) - 6} more)" if len(cycle_members) > 6 else ""
            anomalies.append(Anomaly(
                Reason.CYCLE, chain.root_hash,
                f"cycle detected in chain; members: {preview}{extra}",
            ))
            for h in cycle_members:
                chain.by_hash[h].annotations["cycle_member"] = True
            result = VerificationResult(Designation.NONE, 0.0, 0, 0, {}, anomalies)
            result.graph = chain_to_graph(chain)
            return result

        # per-node integrity + structural, in precedence order
        seen_serial: dict[tuple, str] = {}
        for h in order:
            node = chain.by_hash[h]
            att = node.attestation

            pub_b64, verified = adapters.resolve_key(att.supplier_id, self.registry)
            node.signer_known = pub_b64 is not None and verified
            if not node.signer_known:
                self._fail(node, Reason.UNKNOWN_ISSUER, anomalies,
                           f"supplier {att.supplier_id} not a verified issuer")
                continue

            node.sig_valid = adapters.verify_signature(att, pub_b64)
            if not node.sig_valid:
                self._fail(node, Reason.SIGNATURE_INVALID, anomalies, "signature does not verify")
                continue

            key = adapters.replay_key(att, node)
            if key is not None:
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

        # advisory anomalies (no effect on verdict)
        try:
            from . import anomaly  # noqa: PLC0415
            anomalies.extend(anomaly.score(chain.by_hash.values()))
        except Exception:
            pass

        pct = canadian / total if total else 0.0
        result = VerificationResult(designation, pct, total, canadian, by_country, anomalies)

        # P5: deterministic rule-based advisories. Run AFTER result is built so
        # rules can read final designation / cost_by_country. Advisory only —
        # rules.evaluate guarantees Anomaly(advisory=True) for everything it
        # appends, so this can never change `designation`.
        try:
            from . import rules  # noqa: PLC0415
            result.anomalies.extend(rules.evaluate(chain, result))
        except Exception:
            pass

        result.graph = chain_to_graph(chain)
        return result

    @staticmethod
    def _fail(node, reason: Reason, anomalies: list[Anomaly], detail: str) -> None:
        node.status = Status.INVALID
        node.reason = reason
        anomalies.append(Anomaly(reason, node.hash, detail))


def verify_root(store, registry: dict, root_hash: str) -> VerificationResult:
    """Verify the product whose finished-good attestation has the given hash.

    `store` is polymorphic: a `storage.Store` (SQLite, current backend default)
    or a plain `dict[hash, wire_dict]` (legacy tests + scripts). Scoping by
    reachable() from root prevents shared raw-material lots from looking
    over-consumed across unrelated chains.
    """
    atts = []
    if hasattr(store, "iter_attestations"):
        items = store.iter_attestations()        # storage.Store
    else:
        items = ((h, v) for h, v in store.items())  # legacy dict
    for _h, v in items:
        try:
            atts.append(adapters.attestation_from_dict(v))
        except Exception:
            continue  # skip malformed/unparseable entries — degrade gracefully
    full = build_chain(atts, root_hash)
    reachable = full.reachable()
    scoped = [full.by_hash[h].attestation for h in reachable]
    chain = build_chain(scoped, root_hash)
    result = Verifier(registry).verify(chain)
    # If the store carries a transparency log, decorate the graph with log refs
    # and attach the current log head to the result for top-level display.
    if hasattr(store, "log_entry_for") and result.graph:
        for node in result.graph.get("nodes", []):
            entry = store.log_entry_for(node["id"])
            if entry:
                node["log_seq"] = entry["seq"]
                node["chain_hash"] = entry["chain_hash"]
    if hasattr(store, "log_head"):
        result.log_head = store.log_head()  # type: ignore[attr-defined]
    return result


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
            "contribution_cents": node.contribution_cents,
            "criticality": node.annotations.get("criticality"),
        })
        for ih in node.input_hashes:
            if ih in chain.by_hash:
                edges.append({"source": ih, "target": h})
    return {"nodes": nodes, "edges": edges}


def result_to_dict(r: VerificationResult) -> dict:
    out = {
        "designation": r.designation.value,
        "canadian_pct": r.canadian_pct,
        "total_cost_cents": r.total_cost_cents,
        "canadian_cost_cents": r.canadian_cost_cents,
        "cost_by_country": r.cost_by_country,
        "anomalies": [anomaly_to_dict(a) for a in r.anomalies],
        "graph": r.graph,
    }
    # Optional log head, attached by verify_root when the store has a log.
    head = getattr(r, "log_head", None)
    if head is not None:
        out["log_head"] = head
    return out


# ---- real spec POST /verify path (04 §10) ---------------------------------
def verify_chain(registry: dict, product_attestation_id: str, wire_atts: list[dict]):
    """Verify a whole chain submitted in one request. Stateless: builds the DAG
    in-memory (no store), runs the engine, then folds in the detector registry.
    Returns (result, chain)."""
    atts = []
    raw_by_att_id: dict[str, dict] = {}
    for w in wire_atts or []:
        try:
            a = adapters.attestation_from_dict(w)
        except Exception:
            continue  # malformed entries degrade gracefully
        atts.append(a)
        if a.attestation_id:
            raw_by_att_id[a.attestation_id] = w

    # Root = content hash of the attestation whose id == product_attestation_id.
    root_hash = None
    for a in atts:
        if a.attestation_id == product_attestation_id:
            root_hash = adapters.compute_hash(a)
            break
    if root_hash is None:
        root_hash = product_attestation_id  # tolerate a content-hash being passed

    chain = build_chain(atts, root_hash)
    result = Verifier(registry).verify(chain)

    # Additive detector pass (Lanes B–E). Stubs return [] in Lane 0.
    ctx = VerifyContext(
        nodes_by_hash=chain.by_hash,
        nodes_by_att_id={
            n.attestation.attestation_id: n
            for n in chain.by_hash.values() if n.attestation.attestation_id
        },
        raw_by_att_id=raw_by_att_id,
        root_hash=chain.root_hash,
        product_attestation_id=product_attestation_id,
        registry=registry,
    )
    result.anomalies.extend(run_detectors(ctx))
    return result, chain


# Internal Reason -> spec free-form snake_case `type` label (04 §12).
REASON_TO_TYPE = {
    Reason.SIGNATURE_INVALID: "signature_invalid",
    Reason.UNKNOWN_ISSUER: "signature_unknown_supplier",
    Reason.REPLAY_DETECTED: "replay_within_chain",
    Reason.BROKEN_LINK: "dangling_parent",
    Reason.CYCLE: "circular_reference",
    Reason.MASS_BALANCE: "mass_balance_violation",
    Reason.TEMPORAL_INVERSION: "timestamp_inversion",
    Reason.MALFORMED: "insufficient_data",
}


def to_verify_response(result: VerificationResult, chain, product_attestation_id: str) -> dict:
    """Map the internal result -> the spec response (04 §10). Advisory/heuristic
    anomalies are dropped (not real violations — surfacing them tanks F1).
    chain_valid = no scored anomalies remain."""
    id_by_hash = {h: (n.attestation.attestation_id or h) for h, n in chain.by_hash.items()}
    anomalies: list[dict] = []
    seen: set = set()
    for a in result.anomalies:
        if getattr(a, "advisory", False):
            continue
        att_id = id_by_hash.get(a.attestation_hash, a.attestation_hash)
        type_label = a.type_label or REASON_TO_TYPE.get(a.reason) or a.reason.value.lower()
        if (att_id, type_label) in seen:
            continue
        seen.add((att_id, type_label))
        anomalies.append({"type": type_label, "attestation_id": att_id, "details": a.detail})
    return {
        "product_attestation_id": product_attestation_id,
        "canadian_content_percentage": round(result.canadian_pct * 100, 2),
        "designation": result.designation.value.lower(),
        "chain_valid": len(anomalies) == 0,
        "anomalies": anomalies,
    }
