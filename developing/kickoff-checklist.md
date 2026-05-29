# Kickoff Checklist — the day-of plug-in (30 May)

> Everything spec-independent is built and green (see `pre-event-remaining-plan.md`).
> The day is **translate → swap → wire → submit**. Work this list top-to-bottom.
> The whole verdict pipeline already runs on mock data; you are only filling the
> six adapter bodies and confirming the four unknowns.

## 0. Read the spec (first 20 min)
Get: attestation schema, canonical serialization rule, registry format, reference
signing library, sample chains + expected outputs, official self-test interface.

## 1. The four unknowns → the one-line change each
Everything is pre-staged behind `backend/app/spec.py` + the six adapters. Confirm
the rule, then flip the selector (or env var) — no new code under pressure.

| # | Unknown | Confirm from spec | Change here | Pre-staged variants |
|---|---|---|---|---|
| 1 | **Substantial-transformation rule** (biggest verdict-mover) | how ST is identified from attestation data | `spec.ST_STRATEGY` → `adapters.find_last_st` | `flag` (default) · `root` · `activity` |
| 2 | **Cost-flow / partial-consumption** | how cost is attributed across tiers | `spec.COST_FLOW` → `content.attribute_costs` | `fraction` (default) · `full` |
| 3 | **Canonical serialization** | DSSE/PAE vs RFC-8785 JCS | `spec.SERIALIZATION` → `adapters.canonicalize` | `jcs` (default) · `dsse` |
| 4 | **Field names + registry format** | real wire field names; registry shape | `adapters.validate` (+ `schema/attestation.schema.json`), `adapters.resolve_key`, `registry._normalize` | dict / list / `{issuers:…}` shapes already absorbed |

## 2. Fill the six adapter bodies (`backend/app/adapters.py`)
Do **not** change signatures. Swap mock data for the provided sample chains.
- `validate(obj)` → point at the real `schema/attestation.schema.json`.
- `canonicalize(obj)` → set `spec.SERIALIZATION` (likely `dsse`); confirm bytes match the reference lib.
- `verify(msg, sig, key)` → call the **provided reference library** (not our own crypto) if required.
- `resolve_key(id, registry)` → confirm `registry._normalize` handles the real shape.
- `get_costs(att)` → map real cost fields → integer cents; encode the cost-flow rule (#2).
- `find_last_st(chain)` → set `spec.ST_STRATEGY` to the confirmed rule (#1).

## 3. Light up the pipeline on the real sample
```
python scripts/run_chain.py <provided-sample-chain.json>   # prints verdict + graph
python scripts/selftest.py                                  # pytest (+ e2e if backend up)
```
Re-confirm the worked example by hand if the cost-flow or ST rule changed.

## 4. Wire the UIs (a base-URL swap)
Set `VITE_BACKEND_URL` for both `frontend/purchaser` and `frontend/supplier` to the
live backend; purchaser live mode (`?mock=0`) consumes the real `/verify` graph.

## 5. Ship
- `docker compose up --build` clean from a fresh clone.
- Run the **official** self-test harness; match the required service name / port /
  run command exactly (ours: `verifier-backend` on `:8000`).
- Submit before the deadline. A packaged submission that scores beats a better one
  that never shipped.

## Confirm-before-trusting (the two verdict-movers)
- [ ] **ST rule** (#1): our default assumes a per-node flag. If the spec says the
      final assembler/root, or an `activity` enum, switch `ST_STRATEGY` and re-test
      `foreign_assembly` (the two-condition proof).
- [ ] **Cost-flow** (#2): default is consumption-fraction weighting. If the spec says
      full-cost-once, set `COST_FLOW=full` and re-assert the worked example.

*Pre-built around the unknowns; the day is mechanical translation.*
