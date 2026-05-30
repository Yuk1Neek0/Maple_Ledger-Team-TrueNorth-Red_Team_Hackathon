"""Deterministic rule-based advisory anomalies (P5).

Sits alongside anomaly.py (IsolationForest). Same advisory contract: each rule
emits Anomaly(reason=<specific>, advisory=True) and MUST NOT change the verdict.

Why deterministic rules + ML side-by-side: named rules carry auditor-grade
explainability ("HIGH_FOREIGN_DEPENDENCY: 47% of cost from CN") that the
opaque IsolationForest score can't match. ML still catches shapes the rules
don't predict.
"""
from __future__ import annotations

from datetime import datetime
from statistics import median

from .models import Anomaly, Reason


def evaluate(chain, result) -> list[Anomaly]:
    """Run every rule against the verified chain + final VerificationResult.
    Order is stable and matches the Reason enum order for predictable display."""
    out: list[Anomaly] = []
    out.extend(_zero_labour_on_st(chain))
    out.extend(_high_foreign_dependency(chain, result))
    out.extend(_suspicious_cost_spike(chain))
    out.extend(_low_canadian_with_claim(chain))
    out.extend(_labour_cost_outlier(chain))
    out.extend(_timestamp_burst(chain))
    return out


# ---- rule 1: ST claimed but zero labour ----------------------------------
def _zero_labour_on_st(chain) -> list[Anomaly]:
    """A substantial transformation that involved no labour is suspicious —
    transformation requires work; zero labour suggests a misclassification or
    a deliberate over-claim."""
    out = []
    for h, node in chain.by_hash.items():
        att = node.attestation
        if att.is_substantial_transformation and att.labour_cents == 0:
            out.append(Anomaly(
                Reason.ZERO_LABOUR_ON_ST, h,
                f"node claims substantial transformation but labour_cents=0 "
                f"(materials_cents={att.materials_cents})",
                advisory=True,
            ))
    return out


# ---- rule 2: passing verdict with high foreign cost ----------------------
def _high_foreign_dependency(chain, result) -> list[Anomaly]:
    """When a verdict passes (MIC/POC) but a single foreign country contributes
    >=40% of cost, flag it. The verdict is still correct — this is a strategic
    risk advisory, not a verdict change."""
    if result.designation.value == "NONE" or result.total_cost_cents == 0:
        return []
    out = []
    for country, cents in result.cost_by_country.items():
        if country == "CA":
            continue
        share = cents * 100 // result.total_cost_cents
        if share >= 40:
            out.append(Anomaly(
                Reason.HIGH_FOREIGN_DEPENDENCY, chain.root_hash,
                f"verdict passes but {country} contributes {share}% of cost "
                f"({cents} of {result.total_cost_cents} cents)",
                advisory=True,
            ))
    return out


# ---- rule 3: cost spike vs sibling inputs --------------------------------
def _suspicious_cost_spike(chain) -> list[Anomaly]:
    """For each consumer node, compare its inputs' own-costs. A sibling whose
    own_cost is >= 5x the median of its peer-set looks anomalous (e.g., one
    input grossly overpriced relative to siblings going into the same step)."""
    out = []
    for consumer in chain.by_hash.values():
        sibling_hashes = consumer.input_hashes
        if len(sibling_hashes) < 3:
            continue  # need a meaningful median
        siblings = [chain.by_hash[h] for h in sibling_hashes if h in chain.by_hash]
        if len(siblings) < 3:
            continue
        costs = [s.attestation.materials_cents + s.attestation.labour_cents for s in siblings]
        med = median(costs)
        if med == 0:
            continue
        for s, c in zip(siblings, costs):
            if c >= 5 * med:
                out.append(Anomaly(
                    Reason.SUSPICIOUS_COST_SPIKE, s.hash,
                    f"own_cost {c} is {c / med:.1f}x the median of sibling inputs ({med}) "
                    f"feeding {consumer.hash[:12]}",
                    advisory=True,
                ))
    return out


# ---- rule 4: ST claimed but work_country != CA ---------------------------
def _low_canadian_with_claim(chain) -> list[Anomaly]:
    """A node that claims substantial transformation but did the work outside
    Canada — useful diagnostic when the chain still passes the cost threshold."""
    out = []
    for h, node in chain.by_hash.items():
        att = node.attestation
        if att.is_substantial_transformation and att.work_country != "CA":
            out.append(Anomaly(
                Reason.LOW_CANADIAN_WITH_CLAIM, h,
                f"is_substantial_transformation=true but work_country='{att.work_country}'",
                advisory=True,
            ))
    return out


# ---- rule 5: labour-cost z-score outlier ---------------------------------
def _labour_cost_outlier(chain) -> list[Anomaly]:
    """labour_per_unit z-score >= 3 across the chain. Deterministic; reproduces
    a subset of what IsolationForest flags but with an exact threshold and a
    human-readable z-score."""
    out = []
    nodes = list(chain.by_hash.values())
    if len(nodes) < 3:
        return out
    per_unit = []
    for node in nodes:
        att = node.attestation
        qty = max(1, att.output.quantity)
        per_unit.append(att.labour_cents / qty)
    mean = sum(per_unit) / len(per_unit)
    var = sum((v - mean) ** 2 for v in per_unit) / len(per_unit)
    std = var ** 0.5
    if std < 1e-9:
        return out
    for node, v in zip(nodes, per_unit):
        z = (v - mean) / std
        if abs(z) >= 3:
            out.append(Anomaly(
                Reason.LABOUR_COST_OUTLIER, node.hash,
                f"labour_per_unit={v:.0f} cents is z={z:.2f} std-devs from mean ({mean:.0f})",
                advisory=True,
            ))
    return out


# ---- rule 6: timestamp burst from one supplier ---------------------------
def _timestamp_burst(chain) -> list[Anomaly]:
    """More than 3 attestations from the same supplier within a 60-second window
    suggests script-generated activity (or a clock issue). Advisory only."""
    by_supplier: dict[str, list[tuple[datetime, str]]] = {}
    for h, node in chain.by_hash.items():
        try:
            ts = datetime.fromisoformat(node.attestation.timestamp.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            continue
        by_supplier.setdefault(node.attestation.supplier_id, []).append((ts, h))
    out = []
    for supplier, entries in by_supplier.items():
        entries.sort(key=lambda e: e[0])
        for i in range(len(entries)):
            window = [entries[i]]
            for j in range(i + 1, len(entries)):
                if (entries[j][0] - entries[i][0]).total_seconds() <= 60:
                    window.append(entries[j])
                else:
                    break
            if len(window) > 3:
                for _ts, h in window:
                    out.append(Anomaly(
                        Reason.TIMESTAMP_BURST, h,
                        f"supplier {supplier} submitted {len(window)} attestations "
                        f"within 60s starting {window[0][0].isoformat()}",
                        advisory=True,
                    ))
                break  # one window per supplier is enough
    return out
