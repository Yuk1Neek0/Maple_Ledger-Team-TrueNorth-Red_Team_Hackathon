# Maple Ledger — Web Frontend Progress

Tracks the frontend build against `doc/maple_ledger_api_and_design_docs.md`.
Auth is **out of scope** (mocked identities only), per request.

_Last updated: 2026-05-30_

---

## 0. Reality check: design doc vs. actual backend

The design doc describes an aspirational **productized `/api/v1/*` API** (dashboards,
saved verifications, graph/breakdown/anomaly endpoints, reports). The **real backend**
(`backend/app/main.py`) only exposes the challenge-grade contract:

| Method | Path | Status |
|---|---|---|
| POST | `/verify` | ✅ live — whole-chain verification |
| POST | `/attestations` | ✅ live — submit signed attestation |
| GET  | `/verify/{root_hash}` | ✅ live |
| GET  | `/log/head`, `/log/{hash}` | ✅ live |
| GET  | `/registry` | ✅ live |
| POST | `/draft`, `/ask` | ✅ live |
| `GET /api/v1/supplier/dashboard` etc. | — | ❌ **not implemented in backend** |

**Decision:** build against the *real* contract. Dashboards / saved history / report
export from the doc are deferred (no backing API) and noted 🅿️ Parked rather than faked.

---

## 1. App architecture (as-built)

Two separate Vite + React 19 + Tailwind v4 apps sharing the same design tokens/shell:

- `frontend/supplier` (dev `:5174`) — author → confirm → issue a signed attestation (client-side Ed25519).
- `frontend/purchaser` (dev `:5173`) — load a chain (scan QR / paste / upload / worked example) → `POST /verify` → verdict + graph.
- Backend dev `:8000`.

Design tokens from doc §2 implemented verbatim in each `src/index.css` `@theme`. Red used sparingly (§15.4). ✅

---

## 2. Screen-by-screen status

Legend: ✅ done · 🟡 partial · ❌ missing · 🅿️ parked (no backing API)

### Supplier
| Screen / feature (doc ref) | Status | Notes |
|---|---|---|
| Supplier Dashboard (11.1) | 🅿️ | needs `GET /supplier/dashboard` |
| Create Attestation — author form (11.2) | ✅ | identity, output, action type, parents, costs |
| → live substantial-transformation calc | ✅ | labour ≥ 4h badge |
| → parent inputs add/remove | ✅ | manual entry; search/scan parent = 🅿️ |
| → Review & Sign (11.2 step 6) | ✅ | canonical bytes + content-hash preview + sign |
| → Download JSON | ✅ | added this session |
| → Generate QR | ✅ | added this session — encodes signed attestation for purchaser scan |
| Attestation Detail (11.3) | 🟡 | issued step shows hash/signature/verdict/JSON/QR; standalone route = 🅿️ |

### Purchaser
| Screen / feature (doc ref) | Status | Notes |
|---|---|---|
| Purchaser Dashboard (11.4) | 🅿️ | needs `GET /purchaser/dashboard` |
| Verify input — scan/paste/upload (11.4/11.5) | ✅ | QR scan + paste + file upload + worked example |
| → upload JSON file | ✅ | added this session |
| Verification Result summary cards (11.5) | ✅ | VerdictCard: designation, %, validity, anomalies |
| Supply Chain Graph (11.6) | ✅ | ProvenanceGraph (@xyflow/react), node colors, anomaly highlight |
| Canadian Content Breakdown (11.8) | ✅ | CostDetailModal — by-country ring + per-component bars |
| Anomaly Panel (11.7) | ✅ | AnomalyList, humanized type/severity/explanation |
| **Tampering demo** (§17 step 3) | ✅ | added this session — one-click tampered chain → `parent_hash_mismatch`, node highlighted, `none/invalid` |
| Plausibility demo (§17 step 4) | ❌ | needs valid-signature/implausible-value fixture (re-signing with kit keys) |
| Strategic criticality (beyond doc) | ✅ | advisory lens, value-add classification |
| Verification history (9.4) / Report export (9.8/9.9) | 🅿️ | need persistence APIs |

---

## 3. Cross-cutting (doc §15)
15.1 trust visible ✅ · 15.2 crypto vs plausibility ✅ · 15.3 explain designation ✅ · 15.4 red sparing ✅ · 15.5 mono evidence ✅

---

## 4. Tests — Playwright e2e (`frontend/e2e/`)

Run: `cd frontend/e2e && npx playwright test` (drives the live dev servers + backend).

**4/4 passing:**
1. Purchaser worked-example → Made in Canada / intact / 58.4%.
2. Purchaser tampered-example → Not Qualified / compromised / "Parent hash mismatch".
3. Purchaser paste-chain JSON → renders a verdict.
4. Supplier default form → sign → issued, with Download JSON + Generate QR (canvas renders).

---

## 5. Work log
- **2026-05-30** — Audited existing supplier + purchaser apps vs design doc; confirmed real backend contract. Created tracker.
- **2026-05-30** — Supplier issued step: **Download JSON** + **Generate QR** (qrcode dep) → closes supplier→purchaser demo round-trip (§17 step 1→2).
- **2026-05-30** — Purchaser: **JSON file upload** input mode.
- **2026-05-30** — Removed purchaser favicon (`index.html` → empty `data:` icon).
- **2026-05-30** — One-click **tampering demo** (§17 step 3); `tampered_example_chain.json` backend-confirmed `parent_hash_mismatch` / `none` / invalid.
- **2026-05-30** — **End-to-end verified live**: `POST /verify` worked example = `made_in_canada · 58.4% · valid · 0 anomalies`. Both apps build clean.
- **2026-05-30** — Playwright e2e suite added, **4/4 pass**.

> ⚠️ This file was deleted once by an external process mid-session (a copy of the design doc, `frontend/design_doc.md`, appeared at the same time). Recreated from session history. All implementation files (AttestationShare.jsx, tampered fixture, e2e/) survived intact.
> Note: one **pre-existing** lint error in purchaser `CostDetailModal` (`acc +=` reassign, ~line 583) is unrelated to these changes; build is unaffected.

---

## 6. Next candidates
1. Plausibility demo (§17 step 4) — re-sign an implausible chain via kit keys.
2. Supplier/Purchaser dashboards — require productized `/api/v1` endpoints.
3. Saved verification history + report export — require persistence APIs.
4. Fix pre-existing `acc +=` lint error in purchaser `CostDetailModal`.
