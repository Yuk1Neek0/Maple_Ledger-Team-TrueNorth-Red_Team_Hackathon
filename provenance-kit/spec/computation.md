# Computation Specification

**Status:** Locked

How the verifier computes `canadian_content_percentage` and `designation` from a chain. Defined unambiguously so the scoring harness can grade deterministically.

This computation runs on the chain as submitted. Whether anomalies affect `chain_valid` is separate (see test catalog); the percentage/designation below is computed regardless, on the cost/country data present.

---

## Inputs

A set of attestations forming a DAG, plus the `product_attestation_id` identifying the leaf (finished product).

## Step 1: Canadian content percentage

Flat sum over every attestation in the chain. No recursive cost-weighting.

```
canadian_total = 0
total = 0

for A in attestations:
    node_cost = A.costs.material_cad + A.costs.labour_cost_cad
    total += node_cost
    if A.performed_in_country == "CA":
        canadian_total += node_cost

percentage = (canadian_total / total) * 100   # if total > 0
```

- Attribution is by `performed_in_country` on each attestation, NOT the supplier's `registered_country`.
- `material_cad` and `labour_cost_cad` are treated identically for the percentage (both are "direct costs of production"). `labour_hours` is NOT a cost and does not enter the percentage.
- If `total == 0`, percentage is undefined → treat as `insufficient_data` (designation `none`).

## Step 2: Identify the last substantial transformation

A node qualifies as a substantial transformation iff BOTH:

```
A.action_type in {component_manufacture, subassembly, final_integration}
AND A.costs.labour_hours >= 4
```

The **last** substantial transformation:

1. If the product (leaf) attestation qualifies → it is the last substantial transformation.
2. Otherwise, walk back through parents (breadth-first or depth-first from the leaf) and select the qualifying node **closest to the leaf** (fewest hops). This is "deepest in the assembly," i.e. latest in production.
3. If no node in the chain qualifies → there is NO substantial transformation.

> Note for branching DAGs: "closest to the leaf" = minimum hop-distance from the product attestation. If two qualifying nodes tie at the same distance on different branches, either may be selected. The designation only depends on whether the selected node's `performed_in_country == "CA"`, and test cases will avoid constructing ambiguous ties where the two branches disagree on country. (Flagged for test-design discipline.)

## Step 3: Designation

```
if total == 0 or no substantial transformation exists:
    designation = "none"
elif last_substantial_transformation.performed_in_country != "CA":
    designation = "none"
elif percentage >= 98:
    designation = "product_of_canada"
elif percentage >= 51:
    designation = "made_in_canada"
else:
    designation = "none"
```

Thresholds are inclusive (`>=`). 51.0% → made_in_canada; 98.0% → product_of_canada.

---

## Worked example

Chain (simplified):

| attestation | action | country | material_cad | labour_hrs | labour_cad |
|---|---|---|---|---|---|
| raw fabric | raw_material_supply | FR | 360 | 0 | 0 |
| raw line | raw_material_supply | FR | 80 | 0 | 0 |
| enclosure | raw_material_supply | US | 140 | 0 | 0 |
| parachute mfg | component_manufacture | CA | 0 | 6.5 | 520 |
| final integ. | final_integration | CA | 0 | 4.5 | 360 |

- total = 360 + 80 + 140 + 0 + 0 + 0 + 520 + 0 + 360 = 1460
- canadian_total (CA rows) = 520 + 360 = 880
- percentage = 880 / 1460 × 100 = 60.3%
- last substantial transformation: final integration (leaf qualifies: final_integration, 4.5 ≥ 4), performed in CA ✓
- 60.3% ≥ 51 → **made_in_canada**

---

## Mass-balance verification (LOCKED)

Mass-balance is an integrity check (affects `chain_valid` / `anomalies`), separate from the percentage. The rule is a per-node consumption budget:

```
for each attestation P in the chain:
    total_consumed(P) = Σ quantity_consumed over EVERY parents[] entry
                        (across all attestations) that references P.attestation_id
    if total_consumed(P) > P.output.quantity_produced + ε:
        flag mass_balance_violation on P
```

Locked semantics:

1. **Over-consumption only (`>`, not `≠`).** Drawing *more* than was produced is the violation. Under-consumption (leftover, scrap, partial-lot use) is legitimate and must NOT be flagged.
2. **Per-parent, same-unit only.** The check compares a child's `quantity_consumed` against *that same parent's* `output.quantity_produced`, never a transformation's inputs against its output (different units; value is created by labour). Cross-unit parent references are caught separately as `unit_mismatch`, not mass-balance.
3. **Attribute to the parent P** (the over-consumed node), not the consuming child. In multi-consumer cases no single child is individually illegal, so the violation is a property of P's budget. `anomalies[].attestation_id` = P; `details` may name the consumers.
4. **Epsilon** `ε = 1e-6` on the comparison, for float-accumulation safety only, not a waste/yield allowance.

The arithmetic is trivial; the difficulty is structural: implementations that check edges pairwise or per-immediate-subtree miss violations where consumption of a shared node aggregates across distant branches (diamonds, deep fan-out). The verifier must sum *all* consumers of each node globally.

## Grading notes (see scoring formula for weights)

- `canadian_content_percentage` graded within tolerance (proposed ±0.5 absolute).
- `designation` graded exact-match.
- These are computed independently of anomaly detection; a chain can be invalid (anomalies present) yet still produce a percentage/designation from the data present. Test `expected.json` files specify all of: percentage, designation, chain_valid, anomalies.
