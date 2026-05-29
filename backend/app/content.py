"""Canadian-content math (A2 · the hardest, highest-scored).

Cost attribution by consumption fraction across a DAG with sharing, then the
two-condition verdict (cost threshold AND last substantial transformation in
Canada). Money is integer cents; compare with cross-multiplication, never
divide-then-compare. The consumption-fraction weighting is the #1 silent-bug
zone — re-confirm against the real spec at kickoff (it lives only here +
adapters.get_costs).
"""
from __future__ import annotations

from . import adapters
from .models import Designation


def attribute_costs(chain, valid: set[str]) -> tuple[int, int, dict[str, int]]:
    """Returns (total_cents, canadian_cents, cost_by_country) over `valid` nodes.

    flow(root)=1; flow pushes down each consumption edge weighted by
    quantity_used / producer.output.quantity. Each node's own cost is scaled by
    its flow, rounded once, then attributed to its work country.
    """
    order, _ = chain.topo_walk()
    flow = {h: 0.0 for h in chain.by_hash}
    if chain.root_hash in flow:
        flow[chain.root_hash] = 1.0

    for h in reversed(order):  # root-first: consumers finalized before producers
        node = chain.by_hash[h]
        for ref in node.attestation.inputs:
            p = chain.by_hash.get(ref.attestation_hash)
            if p is None:
                continue
            produced = p.attestation.output.quantity
            frac = ref.quantity_used / produced if produced else 0.0
            flow[ref.attestation_hash] += frac * flow[h]

    by_country: dict[str, int] = {}
    total = 0
    for h in valid:
        node = chain.by_hash[h]
        mat, lab, country = adapters.get_costs(node.attestation)
        contrib = round((mat + lab) * flow[h])
        total += contrib
        by_country[country] = by_country.get(country, 0) + contrib
    return total, by_country.get("CA", 0), by_country


def designate(total: int, canadian: int, last_st_in_ca: bool) -> Designation:
    if total == 0 or not last_st_in_ca:
        return Designation.NONE
    if canadian * 100 >= 98 * total:
        return Designation.PRODUCT_OF_CANADA
    if canadian * 100 >= 51 * total:
        return Designation.MADE_IN_CANADA
    return Designation.NONE
