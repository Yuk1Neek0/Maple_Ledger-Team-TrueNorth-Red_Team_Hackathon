"""Event-day variant selector — the single place day-of choices localize (WS4.1).

The four event-day unknowns each have a pre-staged set of variants behind one of
the six adapters. On kickoff we confirm the spec and flip the matching constant
here (or set the env var); no new code under time pressure. Defaults reproduce
today's mock behaviour, so the suite stays green until we deliberately switch.

  1. Substantial-transformation rule  -> ST_STRATEGY      (adapters.find_last_st)
  2. Cost-flow / partial-consumption   -> COST_FLOW        (content.attribute_costs)
  3. Canonical serialization           -> SERIALIZATION    (adapters.canonicalize)
  4. Registry format                   -> handled in registry.load_registry (multi-shape)
"""
from __future__ import annotations

import os

# 3. Canonical serialization: "jcs" (RFC-8785 sorted-key JSON, current) or
#    "dsse" (DSSE/PAE over the JCS body — the likely event-day envelope,
#    build-adopt §2.2). This decides the EXACT bytes that get signed/verified.
SERIALIZATION = os.environ.get("ML_SERIALIZATION", "jcs")
DSSE_PAYLOAD_TYPE = os.environ.get(
    "ML_DSSE_PAYLOAD_TYPE", "application/vnd.maple-attestation+json"
)

# 1. Substantial-transformation identification strategy:
#    "flag"     - nearest-to-root node with is_substantial_transformation (current)
#    "root"     - the final assembler (root) is always the last ST point
#    "activity" - nearest-to-root node whose overlay activity is an ST activity
ST_STRATEGY = os.environ.get("ML_ST_STRATEGY", "flag")
ST_ACTIVITIES = {"manufacture", "assemble", "refine", "integrate"}

# 2. Cost-flow weighting across tiers:
#    "fraction" - consumption-fraction weighting across the DAG (current)
#    "full"     - each valid node's own cost counted once, no weighting
COST_FLOW = os.environ.get("ML_COST_FLOW", "fraction")
