"""Strategic-criticality overlay (WS5.5 / dev-milestones M5.3).

ADVISORY overlay only — lives in Node.annotations, never alters the legal verdict
or any reason code. Answers the likely judge pushback ("is cost % really the most
meaningful metric for defence?") with a separate lens: how much transformation /
value-add a component carries, and how strategically critical it is.

Deterministic heuristic (no AI in this path either): value-add is the labour
share of a node's own cost; substantial transformations and high value-add are
'critical'; low-value-add raw-material leaves are 'commodity'; the rest 'standard'.
"""
from __future__ import annotations


def classify(node) -> dict:
    att = node.attestation
    own = att.materials_cents + att.labour_cents
    value_add = (att.labour_cents / own) if own else 0.0
    is_leaf = len(node.input_hashes) == 0
    if att.is_substantial_transformation or value_add >= 0.6:
        component_class = "critical"      # key transformation / high IP
    elif is_leaf and value_add <= 0.2:
        component_class = "commodity"     # raw material, little transformation
    else:
        component_class = "standard"
    return {"component_class": component_class, "value_add_pct": round(value_add, 4)}
