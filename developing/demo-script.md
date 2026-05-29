# Demo Script — Maple Ledger (draft on mock data)

> Rehearsable narrative. Final live numbers are filled on the day; the mock
> numbers below come from the current fixtures and are correct as-is.
> Through-line: **the Canadian % never moves on a forged or tampered attempt,
> because invalid nodes are excluded from the cost sum.**
>
> Setup: `docker compose up --build` → purchaser `http://localhost:5173/?mock=0`,
> supplier `http://localhost:5174`, backend `:8000`. The fixtures are already in
> the store after `scripts/e2e_check.py` (or POST them live).

## 0. The frame (20s)
"Origin labels rest on supplier self-reporting; nobody can check them. Maple Ledger
makes every supplier contribution a **cryptographically signed attestation**,
chains them from raw material to finished product, and lets a buyer verify the real
origin in seconds. Crypto proves integrity; AI only advises — it never decides the verdict."

## 1. Happy path — trust earned (40s)
- **Show:** scan/paste the `happy_path` root in the purchaser UI.
- **Result:** **MADE_IN_CANADA**, **96.6%** Canadian; provenance graph all green;
  cost breakdown CA 1420 / CN 50.
- **Say:** "Four suppliers, real signatures, last substantial transformation in
  Canada, ≥51% Canadian cost. The graph beside it is the actual verified chain."

## 2. The two-condition rule — `foreign_assembly` (30s)
- **Result:** **NONE**, despite ≥98% Canadian *cost* — because the last substantial
  transformation happened in CN.
- **Say:** "Cost alone never qualifies a product. Both conditions are required.
  This is the rule a court could audit — pure arithmetic, no AI."

## 3. Tamper attack — `tampered` (30s)
- **Result:** **NONE**, reason **SIGNATURE_INVALID**; the tampered node (SUP-DRONE)
  is the red node in the graph.
- **Say:** "Someone edited a field after signing. The signature no longer verifies;
  that node is excluded. The percentage doesn't move in the attacker's favour."

## 4. Forge attack — `unknown_issuer` (20s)
- **Result:** **NONE**, reason **UNKNOWN_ISSUER**.
- **Say:** "A key not in the verified registry. We trust *only* registered identities
  — show the read-only registry view. Forgery is rejected, not averaged in."

## 5. Replay attack — `replay` (20s)
- **Result:** reason **REPLAY_DETECTED** — two attestations reuse the same
  (issuer, output serial); the duplicate is excluded.
- **Say:** "You can't reuse one supplier's claim twice to pad a chain."

## 6. Over-claim — `overdraw` (20s)
- **Result:** **NONE**, reason **MASS_BALANCE** — a node consumed more than upstream
  ever produced.
- **Say:** "Every signature here is valid, but the numbers don't add up. This is the
  attack only quantity accounting catches."

## 7. The AI beat — `anomaly` (30s, the headline)
- **Result:** verdict **PRODUCT_OF_CANADA**, **valid signature**, but an **ANOMALY**
  advisory with score **1.00** on the node with ~5× normal labour cost.
- **Say:** "Crypto says this record is authentic — and it is. AI says it's
  *implausible* and queues it for an auditor. Crypto for integrity, AI for
  plausibility. The score never touched the verdict."
- *(If `ANTHROPIC_API_KEY` is set: in the supplier room, type a plain-English step
  and watch **Draft with AI** fill a schema-valid attestation the human then signs;
  in the purchaser room, ask the **NL verifier** a question and show it answers with
  attestation-id citations — numbers from the math, never the model.)*

## 8. Close (15s)
"Five attack categories, the right rejection reason for each, and a usable answer
even on broken data. Built behind an adapter boundary so the real spec drops in
without touching the verdict logic. That's Maple Ledger."

---
### Fixture → expected (quick reference)
| Fixture | Designation | Reason | Note |
|---|---|---|---|
| happy_path | MADE_IN_CANADA (96.6%) | — | clean 4-tier chain |
| product_of_canada | PRODUCT_OF_CANADA (100%) | — | all-CA |
| foreign_assembly | NONE | — | ≥98% cost, last ST in CN |
| tampered | NONE | SIGNATURE_INVALID | edited after signing |
| unknown_issuer | NONE | UNKNOWN_ISSUER | unregistered key |
| broken_link | NONE | BROKEN_LINK | dangling input |
| duplicate_input | (computed) | BROKEN_LINK | same input referenced twice |
| overdraw | NONE | MASS_BALANCE | consumed > produced |
| replay | (computed) | REPLAY_DETECTED | reused output serial |
| temporal | (computed) | TEMPORAL_INVERSION (advisory) | input dated after consumer |
| anomaly | PRODUCT_OF_CANADA | ANOMALY (advisory) | valid sig, ~5× labour cost |
