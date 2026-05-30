# Event-Day Adapter-Swap Runbook

> Read first thing at kickoff. Numbered steps; do not improvise.

## Goal

Get `python scripts/run_chain.py <provided_sample.json>` returning the correct
verdict against the real spec in under 30 minutes, then pass the official
self-test harness.

---

## Step 0 — Capture the green baseline (1 min)

```bash
cd /Users/laxmankc/Ottawa_Hack/Red-Team-Hackathon
source .venv/bin/activate
cd backend && python -m pytest -q
```

Expected: **76 tests pass.** If not, stop and triage before touching adapters.

---

## Step 1 — Read the spec drop, fill in this table (5 min)

| Spec question | Where to look in the drop | Where in our code |
|---|---|---|
| Canonicalization (JCS or DSSE PAE?) | usually the "signing" section | `backend/app/spec.py:20` (`SERIALIZATION`) |
| DSSE payload-type string (if DSSE) | spec spec | `backend/app/spec.py:21` (`DSSE_PAYLOAD_TYPE`) |
| Reference Ed25519 library (mandated?) | "verification" section | `backend/app/adapters.py:109` (`verify`) |
| Registry file shape | example file | `backend/app/registry.py:_normalize` |
| Field names on attestations | example chain | `backend/app/adapters.py:53` (`attestation_from_dict`) |
| Cost fields (single, split, fractions?) | cost-rule section | `backend/app/adapters.py:127` (`get_costs`) |
| Substantial-transformation rule (flag, root, activity?) | "Made in Canada" section | `backend/app/spec.py:29` (`ST_STRATEGY`) |
| Cost-flow rule (fraction or full?) | "Canadian content" section | `backend/app/spec.py:35` (`COST_FLOW`) |
| Replay/uniqueness rule (serial, lot, hash-only?) | "duplicate detection" | `backend/app/spec.py` (`REPLAY_RULE`) |

---

## Step 2 — Flip env-driven knobs (2 min)

If only the *selector* changes (not the field shape), edit `docker-compose.yml`
or set the env var directly. **Do not edit Python yet.**

```bash
# Examples:
export ML_SERIALIZATION=dsse
export ML_ST_STRATEGY=root          # or activity
export ML_COST_FLOW=full
export ML_REPLAY_RULE=serial_with_lot
```

Re-run preflight to confirm:

```bash
python scripts/preflight.py
```

If preflight is green and the spec only required env flips, **jump to Step 6.**

---

## Step 3 — Update the wire schema (5 min)

If the real attestation JSON uses different field names:

1. Edit `schema/attestation.schema.json` to match the real wire shape.
2. Edit `frontend/supplier/src/schema/attestation.schema.json` to match the
   real signed-payload shape (typically the wire schema minus `signature`).
3. Re-run pytest. Most tests will still pass — schema lives behind `validate`.

---

## Step 4 — Update `attestation_from_dict` (10 min) — THE RISK CONCENTRATION

This is the single most error-prone change. Rewrite only the body of
`backend/app/adapters.py:53` so that a real wire dict becomes an internal
`Attestation`. Map:

```text
real_field_name        → Attestation.field
─────────────────────────────────────────
issuerId / supplier_id → supplier_id
output.serial / id     → output.product_id
output.quantity        → output.quantity (int)
output.unit            → output.unit
inputs[].ref / hash    → InputRef.attestation_hash
inputs[].qty / used    → InputRef.quantity_used (int)
costs.labour_canadian +
  costs.labour_foreign → labour_cents (int total, store split in get_costs)
costs.materials_added_canadian +
  costs.materials_added_foreign → materials_cents (int total)
location.country       → work_country (ISO-2, uppercase)
activity == "manufacture"|"assemble"|"refine"|"integrate"
                       → is_substantial_transformation (bool) OR set
                         annotations["activity"] and use ST_STRATEGY=activity
timestamp / issuedAt   → timestamp (ISO-8601 string)
signature / sig        → signature
```

Then update `get_costs` if the cost-flow rule needs split CA/foreign cents
(today it returns the total + a single work_country — extend to return
`(canadian_cents, foreign_cents, country)` and update the one caller in
`content.py`).

---

## Step 5 — Re-run the full self-check (3 min)

```bash
python scripts/preflight.py        # adapters consistent?
cd backend && python -m pytest -q  # internal invariants intact?
cd .. && python scripts/run_chain.py <provided_sample.json>
```

If `pytest` is red, that's a real model violation — DO NOT proceed without
understanding it. The existing tests assert the invariants the harness will
also check.

---

## Step 6 — Run the official self-test harness (varies)

Follow the spec's instructions. If it fails:

- **Wrong verdict on one sample?** Check `ST_STRATEGY` and `COST_FLOW` first.
  These are the two most likely culprits.
- **Wrong signature?** Run `python scripts/preflight.py` — section [2] checks
  byte-parity, section [3] checks Ed25519 round-trip.
- **Wrong field?** Trip-through `attestation_from_dict` in section [5].

---

## Things that MUST NOT change at kickoff

- Types in `backend/app/models.py` (the frozen contract).
- Signatures of any function in `adapters.py` (only bodies).
- The route shapes in `main.py` (the harness binds to them).
- The verifier precedence order in `verify.py`.
- The replay-detection logic (use `REPLAY_RULE` instead).

If you find yourself wanting to change any of these, you are off-script.
Stop, re-read the spec, and find the right adapter seam.

---

## Quick reference: which env var maps to which file

| `ML_SERIALIZATION` | `adapters.canonicalize` |
| `ML_DSSE_PAYLOAD_TYPE` | `adapters._pae` |
| `ML_ST_STRATEGY` | `adapters.find_last_st` |
| `ML_COST_FLOW` | `content.attribute_costs` |
| `ML_REPLAY_RULE` | `adapters.replay_key` |
| `ML_DB_PATH` | `main._default_db_path` |
| `ANTHROPIC_API_KEY` | `llm.available` |

---

## After kickoff success

1. Commit the adapter changes with message `kickoff: adapter swap to <spec-name>`.
2. Update HANDOVER.md §17 if any new env vars were added.
3. Re-seed the demo store: `python scripts/seed.py`.
4. Re-take the demo dry-run in the purchaser UI.
