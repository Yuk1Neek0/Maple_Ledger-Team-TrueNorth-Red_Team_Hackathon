# Maple Ledger — Event-Day Swap Guide (30 May)

> The master outline for kickoff. Everything spec-independent is already built and
> green (see `01-implementation-record.md`). The day is **translate → swap → wire →
> test → submit**, not build-from-scratch.
>
> **Golden rule:** the spec only touches code **behind the adapter boundary**
> (`backend/app/adapters.py` + `spec.py`) and a few clearly-listed data/format files.
> The engine (chain, verify precedence, content math, mass-balance, anomaly,
> criticality) consumes the **internal model** and must **not** change.

---

## 0. The day-of sequence

1. **Read the spec** (schema, canonical serialization, registry format, reference signing library, sample chains + expected outputs, official self-test interface).
2. **Decide the 4 unknowns** (§1) and set `spec.py` (§2).
3. **Fill the 6 adapter bodies** + the wire↔internal field mapping (§3).
4. **Swap the data files** (schema, registry, sample chains) (§4).
5. **Match the frontend signer** to the chosen serialization + field names (§5).
6. **Wire the UIs** to the live backend (base-URL) (§6).
7. **Verify** with `run_chain.py` + `selftest.py`, then the **official** harness (§7).
8. **Submit** (§8).

---

## 1. The four unknowns — decide first (they move the verdict)

| # | Unknown | Confirm from the spec | Lands in |
|---|---|---|---|
| 1 | **Substantial-transformation rule** | how ST is identified from attestation data | `spec.ST_STRATEGY` → `adapters.find_last_st` |
| 2 | **Cost-flow / partial-consumption** | how cost is attributed across tiers | `spec.COST_FLOW` → `content.attribute_costs` + `adapters.get_costs` |
| 3 | **Canonical serialization** | DSSE/PAE vs RFC-8785 JCS | `spec.SERIALIZATION` → `adapters.canonicalize` |
| 4 | **Field names + registry format** | real wire field names; registry shape | `adapters.attestation_from_dict`/`payload_dict`, `registry._normalize`, `schema/…json` |

> #1 and #2 are the **silent-bug zone** — re-confirm by hand against the provided
> expected outputs before trusting any verdict.

---

## 2. `spec.py` — the variant selector (flip, don't rewrite)

`backend/app/spec.py`. Defaults reproduce today's mock behaviour; each can also be set via env / root `.env` (and is passed through `docker-compose.yml`).

| Constant | Options (default) | Set to the spec's… |
|---|---|---|
| `SERIALIZATION` | `jcs` \| `dsse` (`jcs`) | serialization rule (DSSE/PAE is pre-written) |
| `DSSE_PAYLOAD_TYPE` | string | the spec's payloadType (only if DSSE) |
| `ST_STRATEGY` | `flag` \| `root` \| `activity` (`flag`) | ST identification rule |
| `ST_ACTIVITIES` | set (`{manufacture,…}`) | the activity values that count as ST (if `activity`) |
| `COST_FLOW` | `fraction` \| `full` (`fraction`) | weighting rule |

If none of the staged variants match, implement the new rule **inside the matching
adapter function only**; the selector wiring is already there.

---

## 3. The 6 adapter seams + field mapping (`backend/app/adapters.py`)

Do **not** change signatures. Swap the bodies.

| Seam / function | Current (mock) | Day-of action |
|---|---|---|
| `validate(obj)` | JSON-Schema vs `schema/attestation.schema.json` | point at / replace with the **real schema** (§4) |
| `canonicalize(obj)` | JCS (sorted-key) or DSSE/PAE via `spec` | set `spec.SERIALIZATION`; confirm bytes match the reference lib |
| `verify(msg, sig, pubkey)` | `pyca/cryptography` Ed25519 | if a **reference library** is provided, call it here instead |
| `resolve_key(supplier_id, registry)` | registry lookup → `(pubkey, verified)` | confirm `registry._normalize` handles the real shape (§4) |
| `get_costs(att)` | reads `materials_cents,labour_cents,work_country` directly | map **real cost fields → integer cents**; encode the cost-flow rule (#2) |
| `find_last_st(chain)` | strategy via `spec.ST_STRATEGY` | set the strategy (#1); add a new one here only if needed |

**Field-name translation (the other key surface):**

| Function | What it does | Day-of action |
|---|---|---|
| `attestation_from_dict(obj)` | wire dict → internal `Attestation` | remap to the **real field names** (e.g. `output.quantity`, `inputs[].attestation_hash`, cost fields) |
| `payload_dict(att)` | internal → the exact dict that gets canonicalized/signed/hashed | must mirror the spec's signed-payload shape exactly |
| `compute_hash(att)` | `SHA-256(canonicalize(payload_dict))` | confirm the spec's id construction (esp. if DSSE changes it) |

> Everything above the adapter boundary already consumes the internal model — once
> these map correctly, the whole pipeline lights up unchanged.

---

## 4. Data / format files to replace

| File | Current | Day-of action |
|---|---|---|
| `schema/attestation.schema.json` | mock schema | replace with the **provided schema** (or repoint `validate`) |
| `data/registry.json` | mock public keys + `verified` | replace with the **provided registry** (or mount it read-only) |
| `backend/app/registry.py` `_normalize` | handles dict / list / `{issuers}` | add a branch if the real shape differs |
| `backend/tests/fixtures/*` | 11 mock chains | use the **provided sample chains**; keep ours as regression where still valid |
| `data/tools/gen_mock.py` | generates mock data | optional once real samples exist; keep for extra cases |

---

## 5. Supplier frontend — must match the backend signer

The browser signs; its bytes **must be byte-identical** to the backend's chosen serialization.

| File | Current | Day-of action |
|---|---|---|
| `frontend/supplier/src/lib/canonical.js` | JCS (matches backend JCS) | if `SERIALIZATION=dsse`, implement DSSE/PAE here to match |
| `frontend/supplier/src/lib/crypto.js` | Ed25519 via `@noble/ed25519` | algorithm stays; ensure it signs the canonical bytes from above |
| `frontend/supplier/src/App.jsx` `buildPayload()` + form fields | mock field names | remap to the **real schema** field names |
| `frontend/supplier/src/schema/*` + `lib/validate.js` | mock schema | replace with the real schema for client-side validation |
| `frontend/supplier/src/devIdentities.js` | mock private seeds | replace with provided demo keys (or wire a registration flow) — **demo only** |

> The supplier UI is not harness-scored; if time is short, the signer match matters
> only for the live authoring demo. The scored path is the backend verifying the
> **provided** sample chains.

---

## 6. Wire the UIs (a base-URL swap)

| Setting | Action |
|---|---|
| `VITE_BACKEND_URL` (both UIs) | point at the live backend |
| `VITE_USE_MOCK` (purchaser) | set `false` for the live demo (or use `?mock=0`) |

The purchaser binds to **our** `VerificationResult` + `graph` shapes (unchanged), so
it needs only the base-URL — no shape rewrite.

---

## 7. Verify after swapping

```
python scripts/run_chain.py <provided-sample-chain.json>   # verdict + graph for any chain
python scripts/selftest.py                                  # pytest (+ live e2e)
```
Then run the **official self-test harness**. Match exactly:
- service name **`verifier-backend`**, port **`8000`**, run via **`docker compose up`**.
- Adjust `docker-compose.yml` only if the spec mandates a different name/port/command.

**Re-confirm the worked example by hand** if the ST rule or cost-flow changed — a
passing test only proves the test was right.

---

## 8. Submit

- Clean `docker compose up --build` from a fresh clone.
- Official harness green (or best-effort).
- Submit before the deadline. A packaged submission that scores beats a better one that never shipped.

---

## 9. What must NOT change (guard against scope creep)

These consume the internal model and are spec-independent — touching them risks
breaking verified behaviour:

- `chain.py` (graph build, topo, cycle guard)
- `verify.py` precedence engine + structural/temporal checks + graph serialization
- `content.py` verdict formula + thresholds (98/51) + subtree % — *only* the cost-flow
  weighting is behind `get_costs`/`spec`
- `massbalance.py`, `anomaly.py`, `criticality.py`, `models.py`
- The `reason`/`Designation` enums and their precedence

---

## 10. One-screen swap checklist

- [ ] Confirm 4 unknowns → set `spec.py` (`SERIALIZATION`, `ST_STRATEGY`, `COST_FLOW`, `DSSE_PAYLOAD_TYPE`).
- [ ] `adapters.validate` → real schema · `schema/attestation.schema.json` replaced.
- [ ] `adapters.canonicalize` → matches reference lib bytes.
- [ ] `adapters.verify` → reference library (if provided).
- [ ] `adapters.resolve_key` + `registry._normalize` → real registry shape · `data/registry.json` replaced.
- [ ] `adapters.get_costs` → real cost fields → integer cents + cost-flow rule.
- [ ] `adapters.find_last_st` → confirmed ST rule.
- [ ] `attestation_from_dict` / `payload_dict` → real field names; `compute_hash` id construction confirmed.
- [ ] Sample chains load via `run_chain.py`; `selftest.py` green.
- [ ] (Demo) supplier `canonical.js` + `buildPayload` + schema match; `devIdentities` updated.
- [ ] UIs `VITE_BACKEND_URL` set; purchaser live mode.
- [ ] Official harness green · service name/port/command match · **submit**.

---

*RedTeam DefTech Ottawa · TrueNorth · event-day swap master outline · companion to developing/kickoff-checklist.md*
