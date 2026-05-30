# Maple Ledger — Cryptographic Provenance for Canadian Supply Chains

**Team TrueNorth · Ottawa Defence Hackathon**

- **Ashton (Zhengshen) Shu** · [@MtsYama](https://github.com/MtsYama) · [LinkedIn](https://www.linkedin.com/in/zhengshen-shu/)
- **Sikai Han** · [@Yuk1Neek0](https://github.com/Yuk1Neek0) · [LinkedIn](https://www.linkedin.com/in/sikai-han-6b7266348/)
- **Laxman KC** · [@laxkc](https://github.com/laxkc) · [LinkedIn](https://www.linkedin.com/in/laxmankc/)

"Buy Canadian" procurement rules turn on whether a product is *Product of Canada* or
*Made in Canada*, but those claims rest on unverifiable supplier self-reporting. Maple
Ledger makes provenance **cryptographic**: every supplier contribution is a signed
attestation, attestations link across tiers into a tamper-evident chain, and the chain is
independently verified to compute the Canadian-content percentage and designation — while
detecting forgery, tampering, replay, and statistically implausible (but rule-legal)
chains.

> **Threat model:** all supplier signing keys are public, so a valid signature proves *who*
> signed a claim — not that the claim is *true*. Maple Ledger therefore checks crypto
> integrity **and** whether a chain is internally consistent and economically plausible.

---

## Quick start

```bash
docker compose up --build
```

Three services come up:

| Service | URL | Role |
|---|---|---|
| `verifier-backend` | http://localhost:8000 | the scored API — `POST /verify` |
| `purchaser-ui` | http://localhost:5173 | scan/load a product chain, see verdict + provenance graph |
| `supplier-ui` | http://localhost:5174 | author + Ed25519-sign an attestation |

Health check: `curl http://localhost:8000/health` → `{"status":"ok"}`.

---

## The `POST /verify` contract

Submit a whole attestation chain (leaf product + all ancestors, any order); get back the
Canadian-content percentage, designation, validity, and detected anomalies. Stateless — no
prior ingest required.

**Request**

```json
{
  "product_attestation_id": "att-...",
  "attestations": [
    {
      "attestation_id": "att-...",
      "supplier_id": "sup-...",
      "timestamp": "2026-04-15T14:30:00Z",
      "action_type": "final_integration",
      "performed_in_country": "CA",
      "parents": [
        { "attestation_id": "att-...", "content_hash": "<sha256 hex>",
          "quantity_consumed": 1, "unit": "units" }
      ],
      "output": { "name": "Recovery Drone", "quantity_produced": 1, "unit": "units" },
      "costs": { "material_cad": 0.0, "labour_hours": 5.0, "labour_cost_cad": 400.0 },
      "signature": { "algorithm": "ed25519", "value": "<base64>" }
    }
  ]
}
```

**Response**

```json
{
  "product_attestation_id": "att-...",
  "canadian_content_percentage": 58.4,
  "designation": "made_in_canada",
  "chain_valid": true,
  "anomalies": [
    { "type": "parent_hash_mismatch", "attestation_id": "att-...", "details": "..." }
  ]
}
```

`designation` ∈ `product_of_canada | made_in_canada | none`. `anomalies[].type` is a
free-form snake_case label (e.g. `signature_invalid`, `mass_balance_violation`,
`transformation_implausible`, `t4_cost_outlier`).

---

## Demo flow

**Purchaser** (http://localhost:5173): click **Load worked example** → see *Made in
Canada · 58.4% · chain valid* with the provenance graph (green = Canadian, grey = foreign).
Use the paste-JSON / file-upload box to verify any chain. Tamper an upstream value and
re-verify to watch the chain flip to **invalid** with the offending node flagged.

**Supplier** (http://localhost:5174): load a demo identity, fill the attestation form,
review the live content hash, then **sign** (Ed25519, in-browser) and submit — the signer
produces bytes that verify byte-for-byte against the backend.

---

## How it works

`POST /verify` rebuilds the DAG from `parents[]` and runs a **layered** verifier:

1. **Deterministic engine (spec-exact):** content-addressing + Ed25519 via a byte-exact
   reference library, signature / unknown-supplier / dangling-parent / cycle / global
   mass-balance / duplicate-id checks.
2. **Computation:** Canadian-content % and designation as a flat sum over **every**
   attestation (`material_cad + labour_cost_cad` attributed by `performed_in_country`),
   independent of anomaly state; last substantial transformation must be in Canada
   (thresholds 98 % / 51 %).
3. **Additive detectors:** structural (`parent_hash_mismatch`, `unit_mismatch`), semantic
   (`transformation_implausible`, `cost_anomaly`), **statistical** outliers learned from the
   genuine-chain distribution (`t4_timing/origin/labour/cost`), and anchor-registry checks
   (`anchor_mismatch`, `replay_cross_chain`). Every detector is conservative so clean chains
   stay clean.

The verifier scores **96.8 %** on the official 1,000-chain public training corpus (99 %
clean precision), reproducing the worked example exactly.

---

## Repository layout

```
backend/app/         FastAPI service: verify engine, detectors/, vendored reference_lib,
                     anomaly_model.json (trained statistical model)
backend/Dockerfile   backend image
frontend/purchaser/  purchaser UI (React/Vite)
frontend/supplier/   supplier UI (React/Vite, in-browser Ed25519 signing)
provenance-kit/      registry/  (supplier public keys + signed anchor registry)
schema/              attestation JSON schema
data/registry.json   legacy mock registry
docker-compose.yml   3-service stack
```

---

## Local development (optional)

```bash
python -m venv .venv
.venv/Scripts/activate            # macOS/Linux: source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn app.main:app --app-dir backend --reload
```

The backend loads the supplier registry and anchor registry from `provenance-kit/registry/`
automatically (override with `ML_REGISTRY_PATH` / `ML_ANCHOR_REGISTRY_PATH`).
