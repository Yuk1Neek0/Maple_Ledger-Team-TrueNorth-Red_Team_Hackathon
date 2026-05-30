# Maple Ledger / TrueNorth Provenance — API & Product Design Docs

## 1. Product summary

Maple Ledger is a dual-account provenance platform for Canadian supply-chain verification.

It supports two main account types:

1. **Supplier account** — creates, signs, manages, and shares provenance attestations.
2. **Purchaser / Verifier account** — verifies product provenance, Canadian-content percentage, designation eligibility, and anomaly status.

The core backend must expose a challenge-compatible verification endpoint while also supporting productized UI workflows such as supplier onboarding, attestation creation, QR-code verification, reports, and verification history.

---

## 2. Design tokens

### Color tokens

| Token | Hex | Usage |
|---|---:|---|
| `navy` | `#26374A` | Header bars, primary navigation, serious government/procurement tone |
| `paper` | `#FFFFFF` | Main surface, cards, panels |
| `paper-2` | `#F4F5F6` | App background, muted sections, table striping |
| `ink` | `#1F2933` | Primary text |
| `ink-2` | `#5C6670` | Secondary text, helper copy |
| `ink-3` | `#9AA0A6` | Disabled text, timestamps, metadata |
| `line` | `#E1E4E7` | Card borders, dividers |
| `line-2` | `#CDD2D7` | Stronger borders, table grid, form outlines |
| `red` | `#D52B1E` | Rare emphasis, critical anomalies, maple-leaf brand accent |
| `ok` | `#1F7A4D` | Verified states, valid chain, success badges |

### Typography

| Font | Weight | Usage |
|---|---|---|
| Space Grotesk | 400 | Body text, table text |
| Space Grotesk | 500 | Form labels, card titles |
| Space Grotesk | 600 | Section titles, tabs, buttons |
| Space Grotesk | 700 | Page headers, key metrics |
| JetBrains Mono | 400/500 | Attestation IDs, hashes, signatures, schema labels |

### Figma variable collection

Native Figma variables should live in:

```text
Collection: Maple Ledger · Tokens
Mode: Light
```

Suggested variable names:

```text
color/navy
color/paper
color/paper-2
color/ink
color/ink-2
color/ink-3
color/line
color/line-2
color/red
color/ok
font/ui
font/mono
radius/card
radius/button
space/1
space/2
space/3
space/4
space/6
space/8
```

---

## 3. Account model

### 3.1 Supplier account

Supplier users create and sign attestations that describe:

- who performed the work,
- where the work happened,
- what inputs were consumed,
- what output was produced,
- direct material and labour costs,
- labour hours,
- cryptographic signature,
- content hash.

Primary supplier jobs:

1. Create a new attestation.
2. Attach parent inputs.
3. Sign the attestation with a registered supplier key.
4. Preview whether the resulting chain verifies.
5. Share or export the attestation as JSON / QR code.

### 3.2 Purchaser / verifier account

Purchaser users verify whether a product claim is trustworthy.

Primary purchaser jobs:

1. Verify a product by attestation ID, QR code, or uploaded JSON.
2. View Canadian-content percentage.
3. View designation: `none`, `made_in_canada`, or `product_of_canada`.
4. Inspect supply-chain graph.
5. Review anomalies and recommendations.
6. Export verification report.

### 3.3 Shared concepts

Both accounts use the same underlying objects:

- Supplier
- User
- Attestation
- Parent input reference
- Product / output
- Verification result
- Anomaly
- Registry anchor
- Report

---

## 4. Core domain objects

### 4.1 Supplier

```json
{
  "supplier_id": "sup-maple-robotics",
  "legal_name": "Maple Robotics Components Ltd.",
  "display_name": "Maple Robotics",
  "country": "CA",
  "public_key": "base64-or-hex-ed25519-public-key",
  "status": "active",
  "created_at": "2026-05-30T10:00:00Z"
}
```

### 4.2 Attestation

```json
{
  "attestation_id": "att-final-001",
  "supplier_id": "sup-maple-robotics",
  "timestamp": "2026-05-30T10:00:00Z",
  "performed_in_country": "CA",
  "action_type": "final_integration",
  "parents": [
    {
      "attestation_id": "att-comp-001",
      "content_hash": "sha256-hex",
      "quantity_consumed": 1,
      "unit": "units"
    }
  ],
  "costs": {
    "material_cad": 3000,
    "labour_cost_cad": 2000,
    "labour_hours": 12
  },
  "output": {
    "product_id": "drone-recon-kit",
    "name": "Drone Recon Kit",
    "quantity_produced": 1,
    "unit": "units"
  },
  "signature": "ed25519-signature"
}
```

### 4.3 Verification result

```json
{
  "product_attestation_id": "att-final-001",
  "canadian_content_percentage": 73.4,
  "designation": "made_in_canada",
  "chain_valid": true,
  "anomalies": []
}
```

### 4.4 Anomaly

```json
{
  "type": "parent_hash_mismatch",
  "attestation_id": "att-comp-067",
  "severity": "critical",
  "message": "Referenced parent hash does not match the submitted parent content.",
  "recommendation": "Request the original upstream supplier attestation."
}
```

---

## 5. Required backend APIs

The API should support both the hackathon verifier and the full product UI.

Recommended base path:

```text
/api/v1
```

Challenge-compatible endpoint:

```text
POST /verify
```

Productized endpoint:

```text
POST /api/v1/verifications
```

The challenge grader may only call `POST /verify`, so that endpoint must remain simple and compatible.

---

# 6. Public challenge-compatible API

## 6.1 POST `/verify`

### Purpose

Verifies a submitted attestation chain and returns the Canadian-content percentage, designation, chain validity, and anomalies.

### Used by

- Challenge autograder
- Purchaser UI verification flow
- Supplier verification preview

### Request

```json
{
  "product_attestation_id": "att-final-001",
  "attestations": [
    {
      "attestation_id": "att-final-001",
      "supplier_id": "sup-maple-robotics",
      "timestamp": "2026-05-30T10:00:00Z",
      "performed_in_country": "CA",
      "action_type": "final_integration",
      "parents": [],
      "costs": {
        "material_cad": 3000,
        "labour_cost_cad": 2000,
        "labour_hours": 12
      },
      "output": {
        "product_id": "drone-recon-kit",
        "name": "Drone Recon Kit",
        "quantity_produced": 1,
        "unit": "units"
      },
      "signature": "ed25519-signature"
    }
  ]
}
```

### Response

```json
{
  "product_attestation_id": "att-final-001",
  "canadian_content_percentage": 73.4,
  "designation": "made_in_canada",
  "chain_valid": true,
  "anomalies": []
}
```

### Required behavior

The verifier must:

1. Accept unordered attestations.
2. Build a directed acyclic graph from parent references.
3. Verify supplier signatures.
4. Verify parent content hashes.
5. Detect missing parents.
6. Detect duplicate attestation IDs.
7. Detect cycles.
8. Detect timestamp inversion.
9. Detect unit mismatch.
10. Detect mass-balance overconsumption.
11. Detect invalid numeric values.
12. Detect implausible transformations.
13. Compute Canadian-content percentage.
14. Compute designation.
15. Return anomalies with stable anomaly type names.

### Canadian-content formula

```text
Canadian direct cost / total direct cost * 100
```

Where direct cost is:

```text
material_cad + labour_cost_cad
```

Do not use `labour_hours` as money.

### Designation rules

A substantial transformation is:

```text
action_type in {component_manufacture, subassembly, final_integration}
and labour_hours >= 4
```

Then:

```text
product_of_canada:
  percentage >= 98
  and last substantial transformation happened in Canada

made_in_canada:
  percentage >= 51
  and last substantial transformation happened in Canada

none:
  all other cases
```

### Error handling

For malformed JSON, return:

```json
{
  "error": {
    "code": "bad_request",
    "message": "Request body must be valid JSON."
  }
}
```

For schema-invalid payloads, prefer a normal verification response with anomalies when possible. Only use HTTP `400` when the request cannot be parsed at all.

---

# 7. Authentication APIs

For the hackathon MVP, authentication can be mocked. For product design, these APIs define the expected behavior.

## 7.1 POST `/api/v1/auth/login`

### Purpose

Creates a session for supplier or purchaser users.

### Request

```json
{
  "email": "alex@maplerobotics.ca",
  "password": "••••••••"
}
```

### Response

```json
{
  "access_token": "jwt-token",
  "user": {
    "user_id": "usr-alex",
    "name": "Alex Morgan",
    "email": "alex@maplerobotics.ca",
    "account_type": "supplier",
    "organization_id": "org-maple-robotics"
  }
}
```

## 7.2 GET `/api/v1/me`

### Purpose

Returns the current authenticated user and organization.

### Response

```json
{
  "user_id": "usr-alex",
  "name": "Alex Morgan",
  "email": "alex@maplerobotics.ca",
  "account_type": "supplier",
  "organization": {
    "organization_id": "org-maple-robotics",
    "name": "Maple Robotics Components Ltd.",
    "supplier_id": "sup-maple-robotics"
  }
}
```

---

# 8. Supplier account APIs

## 8.1 GET `/api/v1/supplier/dashboard`

### Purpose

Loads supplier dashboard metrics.

### Response

```json
{
  "signed_attestations": 42,
  "pending_drafts": 8,
  "products_supplied": 12,
  "verification_issues": 0,
  "key_status": {
    "status": "verified",
    "key_id": "E2AS519",
    "algorithm": "Ed25519"
  },
  "recent_activity": [
    {
      "type": "attestation_signed",
      "message": "Signed final integration attestation for Drone Recon Kit",
      "created_at": "2026-05-30T10:24:00Z"
    }
  ]
}
```

### UI screens using this

- Supplier Dashboard

---

## 8.2 GET `/api/v1/suppliers/{supplier_id}`

### Purpose

Returns supplier identity and public-key information.

### Response

```json
{
  "supplier_id": "sup-maple-robotics",
  "legal_name": "Maple Robotics Components Ltd.",
  "display_name": "Maple Robotics",
  "country": "CA",
  "public_key": "ed25519-public-key",
  "key_status": "verified",
  "status": "active"
}
```

---

## 8.3 GET `/api/v1/supplier/keys`

### Purpose

Returns key status for the signed-in supplier.

### Response

```json
{
  "supplier_id": "sup-maple-robotics",
  "keys": [
    {
      "key_id": "E2AS519",
      "algorithm": "Ed25519",
      "public_key": "ed25519-public-key",
      "status": "active",
      "created_at": "2026-05-01T09:00:00Z"
    }
  ]
}
```

---

## 8.4 POST `/api/v1/supplier/keys/rotate`

### Purpose

Creates a new supplier signing key and marks the old key as superseded.

### Request

```json
{
  "reason": "scheduled_rotation"
}
```

### Response

```json
{
  "old_key_id": "E2AS519",
  "new_key_id": "E2AS520",
  "status": "active"
}
```

For hackathon MVP, this can be a stub.

---

## 8.5 GET `/api/v1/attestations`

### Purpose

Lists attestations visible to the signed-in account.

### Query params

```text
supplier_id optional
product_id optional
status optional: draft | signed | superseded
limit optional
cursor optional
```

### Response

```json
{
  "items": [
    {
      "attestation_id": "att-final-001",
      "product_id": "drone-recon-kit",
      "product_name": "Drone Recon Kit",
      "action_type": "final_integration",
      "performed_in_country": "CA",
      "status": "signed",
      "created_at": "2026-05-30T10:24:00Z"
    }
  ],
  "next_cursor": null
}
```

### UI screens using this

- My Attestations
- Parent Input Search
- Verification Result Attestations tab

---

## 8.6 GET `/api/v1/attestations/{attestation_id}`

### Purpose

Returns one attestation plus computed metadata.

### Response

```json
{
  "attestation": {
    "attestation_id": "att-final-001",
    "supplier_id": "sup-maple-robotics",
    "timestamp": "2026-05-30T10:24:00Z",
    "performed_in_country": "CA",
    "action_type": "final_integration",
    "parents": [],
    "costs": {
      "material_cad": 3000,
      "labour_cost_cad": 2000,
      "labour_hours": 12
    },
    "output": {
      "product_id": "drone-recon-kit",
      "name": "Drone Recon Kit",
      "quantity_produced": 1,
      "unit": "units"
    },
    "signature": "ed25519-signature"
  },
  "metadata": {
    "content_hash": "sha256-hex",
    "signature_valid": true,
    "substantial_transformation": true,
    "qr_url": "/api/v1/attestations/att-final-001/qr"
  }
}
```

### UI screens using this

- Supplier Attestation Detail
- Purchaser Node Detail Panel

---

## 8.7 POST `/api/v1/attestations/drafts`

### Purpose

Creates a draft attestation before signing.

### Request

```json
{
  "supplier_id": "sup-maple-robotics",
  "performed_in_country": "CA",
  "action_type": "final_integration",
  "parents": [
    {
      "attestation_id": "att-comp-045",
      "content_hash": "sha256-hex",
      "quantity_consumed": 4,
      "unit": "units"
    }
  ],
  "costs": {
    "material_cad": 3000,
    "labour_cost_cad": 2000,
    "labour_hours": 12
  },
  "output": {
    "product_id": "drone-recon-kit",
    "name": "Drone Recon Kit",
    "quantity_produced": 1,
    "unit": "units"
  }
}
```

### Response

```json
{
  "draft_id": "draft-001",
  "status": "draft",
  "validation": {
    "can_sign": true,
    "warnings": []
  }
}
```

---

## 8.8 PATCH `/api/v1/attestations/drafts/{draft_id}`

### Purpose

Updates a draft during the create-attestation wizard.

### Request

```json
{
  "parents": [
    {
      "attestation_id": "att-raw-001",
      "content_hash": "sha256-hex",
      "quantity_consumed": 2.5,
      "unit": "kg"
    }
  ]
}
```

### Response

```json
{
  "draft_id": "draft-001",
  "status": "draft",
  "validation": {
    "can_sign": true,
    "warnings": []
  }
}
```

---

## 8.9 POST `/api/v1/attestations/drafts/{draft_id}/preview`

### Purpose

Runs a pre-sign verification preview for the supplier.

### Response

```json
{
  "content_hash_preview": "sha256-hex",
  "substantial_transformation": true,
  "direct_cost_cad": 5000,
  "canadian_contribution_cad": 5000,
  "warnings": []
}
```

---

## 8.10 POST `/api/v1/attestations/drafts/{draft_id}/sign`

### Purpose

Canonicalizes the draft attestation, signs it with the supplier key, stores it as signed, and returns the final attestation.

### Request

```json
{
  "key_id": "E2AS519"
}
```

### Response

```json
{
  "attestation_id": "att-final-001",
  "status": "signed",
  "content_hash": "sha256-hex",
  "signature": "ed25519-signature",
  "attestation": {}
}
```

### UI screens using this

- Create Attestation > Review & Sign

---

## 8.11 GET `/api/v1/attestations/{attestation_id}/qr`

### Purpose

Returns a QR code that encodes either the attestation ID or a verification link.

### Response

```json
{
  "attestation_id": "att-final-001",
  "qr_svg": "<svg>...</svg>",
  "verification_url": "https://app.example.com/verify/att-final-001"
}
```

---

## 8.12 GET `/api/v1/products`

### Purpose

Lists products supplied or verified by the account.

### Response

```json
{
  "items": [
    {
      "product_id": "drone-recon-kit",
      "name": "Drone Recon Kit",
      "latest_attestation_id": "att-final-001",
      "attestation_count": 14,
      "last_verified_at": "2026-05-30T10:30:00Z"
    }
  ]
}
```

---

# 9. Purchaser / verifier APIs

## 9.1 GET `/api/v1/purchaser/dashboard`

### Purpose

Loads purchaser dashboard metrics.

### Response

```json
{
  "products_verified": 56,
  "valid_chains": 52,
  "invalid_chains": 2,
  "made_in_canada": 18,
  "product_of_canada": 21,
  "recent_verifications": [
    {
      "verification_id": "ver-001",
      "product_name": "Drone Recon Kit",
      "designation": "made_in_canada",
      "chain_valid": true,
      "verified_at": "2026-05-30T11:24:00Z"
    }
  ],
  "supplier_risk": {
    "low": 22,
    "medium": 3,
    "high": 1
  }
}
```

### UI screens using this

- Purchaser Dashboard

---

## 9.2 POST `/api/v1/verifications`

### Purpose

Productized verification endpoint that stores history and returns display-ready verification details.

### Request option A: by full attestation chain

```json
{
  "product_attestation_id": "att-final-001",
  "attestations": []
}
```

### Request option B: by known attestation ID

```json
{
  "product_attestation_id": "att-final-001"
}
```

### Response

```json
{
  "verification_id": "ver-001",
  "product_attestation_id": "att-final-001",
  "product": {
    "product_id": "drone-recon-kit",
    "name": "Drone Recon Kit"
  },
  "summary": {
    "canadian_content_percentage": 73.4,
    "designation": "made_in_canada",
    "chain_valid": true,
    "attestations_checked": 14,
    "suppliers_involved": 6,
    "countries_involved": 2,
    "anomalies_detected": 0
  },
  "anomalies": [],
  "graph": {
    "nodes": [],
    "edges": []
  },
  "created_at": "2026-05-30T11:24:00Z"
}
```

### Difference from `/verify`

`POST /verify` is minimal and grader-compatible.

`POST /api/v1/verifications` is richer and supports:

- saved history,
- graph data,
- dashboard metrics,
- report generation,
- detailed UI panels.

---

## 9.3 GET `/api/v1/verifications/{verification_id}`

### Purpose

Returns a saved verification result.

### Response

```json
{
  "verification_id": "ver-001",
  "product_attestation_id": "att-final-001",
  "summary": {
    "canadian_content_percentage": 73.4,
    "designation": "made_in_canada",
    "chain_valid": true
  },
  "anomalies": [],
  "graph": {
    "nodes": [],
    "edges": []
  }
}
```

---

## 9.4 GET `/api/v1/verifications`

### Purpose

Lists previous verifications.

### Query params

```text
designation optional
chain_valid optional
supplier_id optional
from optional ISO date
to optional ISO date
limit optional
cursor optional
```

### Response

```json
{
  "items": [
    {
      "verification_id": "ver-001",
      "product_name": "Drone Recon Kit",
      "product_attestation_id": "att-final-001",
      "designation": "made_in_canada",
      "chain_valid": true,
      "canadian_content_percentage": 73.4,
      "verified_at": "2026-05-30T11:24:00Z"
    }
  ],
  "next_cursor": null
}
```

---

## 9.5 GET `/api/v1/verifications/{verification_id}/graph`

### Purpose

Returns graph-optimized supply-chain data.

### Response

```json
{
  "nodes": [
    {
      "id": "att-final-001",
      "label": "Drone Recon Kit",
      "supplier_name": "Maple Robotics",
      "country": "CA",
      "action_type": "final_integration",
      "direct_cost_cad": 5000,
      "canadian_contribution": true,
      "signature_valid": true,
      "hash_valid": true,
      "anomaly_count": 0,
      "status": "valid"
    }
  ],
  "edges": [
    {
      "source": "att-comp-045",
      "target": "att-final-001",
      "quantity_consumed": 4,
      "unit": "units",
      "hash_status": "valid"
    }
  ]
}
```

### UI screens using this

- Verification Result > Supply Chain Graph

---

## 9.6 GET `/api/v1/verifications/{verification_id}/breakdown`

### Purpose

Returns Canadian-content calculation details.

### Response

```json
{
  "total_direct_cost_cad": 10000,
  "canadian_direct_cost_cad": 7340,
  "canadian_content_percentage": 73.4,
  "by_country": [
    {
      "country": "CA",
      "direct_cost_cad": 7340,
      "percentage": 73.4
    },
    {
      "country": "US",
      "direct_cost_cad": 2660,
      "percentage": 26.6
    }
  ],
  "by_cost_type": {
    "material": {
      "canadian_cad": 4200,
      "non_canadian_cad": 2100
    },
    "labour": {
      "canadian_cad": 3140,
      "non_canadian_cad": 560
    }
  }
}
```

---

## 9.7 GET `/api/v1/verifications/{verification_id}/anomalies`

### Purpose

Returns anomalies with UI-ready severity and recommendations.

### Response

```json
{
  "items": [
    {
      "type": "parent_hash_mismatch",
      "severity": "critical",
      "attestation_id": "att-comp-067",
      "title": "Parent hash mismatch",
      "message": "The child attestation references a parent hash that does not match the actual parent content.",
      "recommendation": "Request the original upstream supplier attestation."
    }
  ]
}
```

---

## 9.8 POST `/api/v1/verifications/{verification_id}/reports`

### Purpose

Generates a procurement-ready report.

### Request

```json
{
  "format": "pdf",
  "include_graph": true,
  "include_full_attestations": false
}
```

### Response

```json
{
  "report_id": "rpt-001",
  "status": "ready",
  "download_url": "/api/v1/reports/rpt-001/download"
}
```

---

## 9.9 GET `/api/v1/reports/{report_id}/download`

### Purpose

Downloads the generated verification report.

### Response

Binary file response:

```text
application/pdf
```

---

# 10. Registry / anchor APIs

## 10.1 GET `/api/v1/registry/anchors/{attestation_id}`

### Purpose

Returns public registry anchor data for an attestation if present.

### Response

```json
{
  "attestation_id": "att-final-001",
  "content_hash": "sha256-hex",
  "product_id": "drone-recon-kit",
  "recorded_at": "2026-05-30T10:30:00Z"
}
```

If no anchor exists:

```json
{
  "attestation_id": "att-final-001",
  "anchor_found": false
}
```

Important: absence from the anchor registry is not automatically suspicious.

---

## 10.2 POST `/api/v1/registry/anchors`

### Purpose

Records an attestation hash in the anchor registry.

### Request

```json
{
  "attestation_id": "att-final-001",
  "content_hash": "sha256-hex",
  "product_id": "drone-recon-kit"
}
```

### Response

```json
{
  "attestation_id": "att-final-001",
  "content_hash": "sha256-hex",
  "status": "recorded"
}
```

---

# 11. UI screen design docs

## 11.1 Supplier Dashboard

### Purpose

Give the supplier a quick operational view of signed attestations, drafts, products, verification issues, and key status.

### Primary actions

- Create Attestation
- View Drafts
- Open My Attestations
- Preview Verification

### Layout

```text
Top bar: navy
Left sidebar: paper surface
Main canvas: paper-2 background
Metric cards: paper cards with line border
```

### Content sections

1. Metric cards
   - Signed Attestations
   - Pending Drafts
   - Products Supplied
   - Verification Issues
   - Key Verified

2. Recent Activity
   - signed attestations
   - parent input additions
   - purchaser verifications
   - draft warnings

3. Attestations by Type
   - raw material supply
   - component manufacture
   - subassembly
   - final integration

4. Verification Status
   - valid
   - warning
   - invalid

### API dependencies

- `GET /api/v1/me`
- `GET /api/v1/supplier/dashboard`
- `GET /api/v1/attestations`

---

## 11.2 Create Attestation Wizard

### Purpose

Guide suppliers through creating a valid signed attestation without needing to understand raw JSON.

### Steps

1. Product / Output
2. Action Type
3. Location
4. Parent Inputs
5. Costs
6. Review & Sign

### Step 1: Product / Output

Fields:

- Product name
- Product ID
- Quantity produced
- Unit
- Batch / lot number

### Step 2: Action Type

Card choices:

- Raw Material Supply
- Component Manufacture
- Subassembly
- Final Integration

Each card includes helper text.

### Step 3: Location

Fields:

- Performed in country
- Facility name
- City
- Province / state

Helper text:

```text
Canadian content is based on where the work was performed, not where the supplier is headquartered.
```

### Step 4: Parent Inputs

Functions:

- Add parent manually
- Search parent attestations
- Scan QR code
- Upload parent JSON

Table columns:

- Parent attestation ID
- Product
- Quantity consumed
- Unit
- Hash status
- Actions

Validation hints:

- Unit must match parent output unit.
- Total consumed cannot exceed produced quantity.

### Step 5: Costs

Fields:

- Material cost CAD
- Labour cost CAD
- Labour hours

Live calculations:

- Direct production cost
- Canadian contribution
- Substantial transformation: yes/no

### Step 6: Review & Sign

Review panel:

- Supplier
- Action
- Location
- Parent count
- Direct cost
- Labour hours
- Substantial transformation
- Content hash preview

Actions:

- Generate Content Hash
- Sign Attestation
- Download JSON
- Generate QR

### API dependencies

- `POST /api/v1/attestations/drafts`
- `PATCH /api/v1/attestations/drafts/{draft_id}`
- `POST /api/v1/attestations/drafts/{draft_id}/preview`
- `POST /api/v1/attestations/drafts/{draft_id}/sign`
- `GET /api/v1/attestations/{attestation_id}/qr`

---

## 11.3 Supplier Attestation Detail

### Purpose

Shows the completed signed attestation and its technical metadata.

### Main sections

1. Header
   - Attestation ID
   - Signed badge
   - Download JSON
   - More actions

2. Attestation summary
   - Output
   - Product type
   - Quantity
   - Created timestamp
   - Supplier
   - Signer
   - Signature status
   - Content hash
   - Hash algorithm

3. QR panel
   - QR code
   - Download JSON

4. Parents
   - Parent attestation chips

5. Costs
   - Material cost
   - Labour cost
   - Labour hours

6. Technical metadata
   - Schema version
   - Hash algorithm
   - Registry status
   - Chain ID
   - Attestation hash

### API dependencies

- `GET /api/v1/attestations/{attestation_id}`
- `GET /api/v1/attestations/{attestation_id}/qr`
- `POST /api/v1/verifications`

---

## 11.4 Purchaser Dashboard

### Purpose

Give procurement users a quick verification command center.

### Primary actions

- Scan QR Code
- Verify Product
- Upload JSON Chain
- View Recent Verifications

### Content sections

1. Metric cards
   - Products Verified
   - Valid Chains
   - Invalid Chains
   - Made in Canada
   - Product of Canada

2. Verification input
   - Paste product attestation ID
   - Verify button
   - Upload JSON file

3. Recent Verifications
   - product name
   - designation badge
   - timestamp
   - valid/invalid badge

4. Supplier Risk Overview
   - low / medium / high risk counts

5. Policy Compliance
   - Buy Canadian threshold
   - Product of Canada threshold

### API dependencies

- `GET /api/v1/me`
- `GET /api/v1/purchaser/dashboard`
- `POST /api/v1/verifications`
- `GET /api/v1/verifications`

---

## 11.5 Verification Result

### Purpose

Show whether the product claim is valid, why it qualifies or fails, and where anomalies exist.

### Top summary

- Product name
- Product attestation ID
- Verification timestamp
- Download Report
- Share

### Primary result cards

1. Canadian Content
   - percentage
   - ring chart

2. Designation
   - `Made in Canada`
   - `Product of Canada`
   - `None`

3. Chain Validity
   - valid / invalid

4. Supporting metrics
   - attestations checked
   - suppliers involved
   - countries involved
   - anomalies detected

### Tabs

1. Supply Chain Graph
2. Canadian Content Breakdown
3. Anomalies
4. Attestations
5. Details

### API dependencies

- `GET /api/v1/verifications/{verification_id}`
- `GET /api/v1/verifications/{verification_id}/graph`
- `GET /api/v1/verifications/{verification_id}/breakdown`
- `GET /api/v1/verifications/{verification_id}/anomalies`
- `POST /api/v1/verifications/{verification_id}/reports`

---

## 11.6 Supply Chain Graph

### Purpose

Make the provenance chain understandable visually.

### Node states

| State | Color | Meaning |
|---|---|---|
| Valid Canadian contribution | ok | Verified and performed in Canada |
| Valid non-Canadian contribution | neutral/blue-gray | Verified but not Canadian contribution |
| Pending / unknown | ink-3 | Missing optional data or unanchored |
| Warning | muted amber | Statistical or semantic concern |
| Invalid | red | Hard-rule violation |

### Node fields

- Product name
- Attestation ID
- Country
- Cost
- Quantity produced
- Signature status
- Hash status
- Anomaly count

### Edge fields

- Quantity consumed
- Unit
- Hash status

### Interactions

- Click node: open attestation side panel.
- Click edge: show parent hash verification details.
- Filter: valid / warning / invalid.
- Zoom and pan.
- Fit to screen.

---

## 11.7 Anomaly Panel

### Purpose

Explain exactly what went wrong and what the purchaser should do next.

### Severity levels

| Severity | Meaning |
|---|---|
| Critical | Chain should not be trusted |
| Warning | Claim may be valid but suspicious |
| Info | Non-blocking context |

### Required fields

- Type
- Severity
- Affected attestation
- Explanation
- Recommendation

### Example

```text
Critical — Parent hash mismatch
Affected: att-comp-067
The child attestation references a parent hash that does not match the actual parent content.
Recommendation: Request the original upstream supplier attestation.
```

---

## 11.8 Canadian Content Breakdown

### Purpose

Make the percentage transparent and auditable.

### Sections

1. Formula summary

```text
Canadian direct costs / total direct costs × 100
```

2. Country table

| Country | Direct cost | Share |
|---|---:|---:|
| CA | `$7,340` | `73.4%` |
| US | `$2,660` | `26.6%` |

3. Cost type table

| Cost type | Canadian | Non-Canadian |
|---|---:|---:|
| Material | `$4,200` | `$2,100` |
| Labour | `$3,140` | `$560` |

4. Designation explanation

For Made in Canada:

```text
✓ Canadian content is at least 51%.
✓ Last substantial transformation happened in Canada.
```

For Product of Canada:

```text
✓ Canadian content is at least 98%.
✓ Last substantial transformation happened in Canada.
```

---

## 12. API-to-screen mapping

| Screen | Required APIs |
|---|---|
| Supplier Dashboard | `GET /me`, `GET /supplier/dashboard`, `GET /attestations` |
| Create Attestation | `POST /attestations/drafts`, `PATCH /drafts/{id}`, `POST /preview`, `POST /sign` |
| Attestation Detail | `GET /attestations/{id}`, `GET /attestations/{id}/qr` |
| Purchaser Dashboard | `GET /purchaser/dashboard`, `POST /verifications`, `GET /verifications` |
| Verification Result | `GET /verifications/{id}`, `GET /graph`, `GET /breakdown`, `GET /anomalies` |
| Report Export | `POST /reports`, `GET /reports/{id}/download` |

---

## 13. Verification service internals

The verification engine should be independent from the API framework.

Recommended structure:

```text
backend/
├── app/
│   ├── main.py
│   ├── routes/
│   │   ├── verify.py
│   │   ├── attestations.py
│   │   ├── verifications.py
│   │   ├── suppliers.py
│   │   └── reports.py
│   ├── services/
│   │   ├── verifier.py
│   │   ├── canonical.py
│   │   ├── crypto.py
│   │   ├── graph.py
│   │   ├── anomalies.py
│   │   ├── designation.py
│   │   └── reports.py
│   ├── models/
│   │   ├── attestation.py
│   │   ├── verification.py
│   │   └── supplier.py
│   └── data/
│       ├── supplier_public_keys.json
│       └── anchor_registry.json
```

Core pure function:

```python
def verify_payload(payload: dict) -> dict:
    ...
```

The `/verify` route should simply call this function and return the result.

---

## 14. Anomaly types

Recommended anomaly enum:

```text
signature_invalid
signature_unknown_supplier
parent_hash_mismatch
circular_reference
dangling_parent
timestamp_inversion
unit_mismatch
mass_balance_violation
replay_within_chain
cost_anomaly
transformation_implausible
invalid_numeric_value
schema_invalid
t4_timing_outlier
t4_origin_outlier
t4_labour_outlier
t4_cost_outlier
```

Recommended severity mapping:

| Type | Severity |
|---|---|
| `signature_invalid` | critical |
| `signature_unknown_supplier` | critical |
| `parent_hash_mismatch` | critical |
| `circular_reference` | critical |
| `dangling_parent` | critical |
| `timestamp_inversion` | critical |
| `unit_mismatch` | critical |
| `mass_balance_violation` | critical |
| `replay_within_chain` | critical |
| `schema_invalid` | critical |
| `invalid_numeric_value` | critical |
| `transformation_implausible` | warning |
| `cost_anomaly` | warning |
| `t4_timing_outlier` | warning |
| `t4_origin_outlier` | warning |
| `t4_labour_outlier` | warning |
| `t4_cost_outlier` | warning |

---

## 15. Design principles

### 15.1 Make trust visible

Every key trust operation should have a visible status:

- signature valid / invalid,
- hash valid / invalid,
- supplier known / unknown,
- chain valid / invalid,
- Canadian contribution yes / no.

### 15.2 Separate crypto validity from claim plausibility

The UI must communicate:

```text
A valid signature proves who signed the claim.
It does not automatically prove the claim is economically plausible.
```

### 15.3 Explain designation decisions

Do not just show `Made in Canada`. Show why:

```text
Canadian content: 73.4% ≥ 51%
Last substantial transformation: Canada
```

### 15.4 Avoid overusing red

Use `red #D52B1E` rarely for:

- critical anomalies,
- invalid chain,
- destructive warnings,
- maple-leaf brand accent.

Use `ok #1F7A4D` for valid verification states.

### 15.5 Use mono text for evidence

Use JetBrains Mono for:

- attestation IDs,
- hashes,
- signatures,
- schema labels,
- product IDs.

This makes evidence fields visually distinct from normal UI copy.

---

## 16. MVP scope

For the hackathon MVP, implement these screens and APIs first.

### Supplier MVP

Screens:

1. Supplier Dashboard
2. Create Attestation Wizard
3. Attestation Detail

APIs:

- `GET /api/v1/supplier/dashboard`
- `GET /api/v1/attestations`
- `POST /api/v1/attestations/drafts`
- `PATCH /api/v1/attestations/drafts/{draft_id}`
- `POST /api/v1/attestations/drafts/{draft_id}/preview`
- `POST /api/v1/attestations/drafts/{draft_id}/sign`
- `GET /api/v1/attestations/{attestation_id}`

### Purchaser MVP

Screens:

1. Purchaser Dashboard
2. Verify Product
3. Verification Result with Graph and Anomaly Panel

APIs:

- `POST /verify`
- `GET /api/v1/purchaser/dashboard`
- `POST /api/v1/verifications`
- `GET /api/v1/verifications/{verification_id}`
- `GET /api/v1/verifications/{verification_id}/graph`
- `GET /api/v1/verifications/{verification_id}/breakdown`
- `GET /api/v1/verifications/{verification_id}/anomalies`

---

## 17. Demo script

### Step 1: Supplier creates evidence

A supplier logs in, creates a final integration attestation, adds parent inputs, enters Canadian labour and material costs, then signs the attestation.

### Step 2: Purchaser verifies product

A purchaser scans the QR code or pastes the product attestation ID.

The result shows:

- chain valid,
- Canadian content percentage,
- designation,
- supply-chain graph,
- no anomalies.

### Step 3: Tampering demo

The demo modifies an upstream parent cost or product field.

The result shows:

- parent hash mismatch,
- affected graph node highlighted,
- recommendation to request original upstream evidence.

### Step 4: Plausibility demo

The demo shows a chain with valid signatures but suspicious labour or cost values.

The result explains:

```text
Crypto proves who signed the claim.
Analytics helps determine whether the claim makes sense.
```

---

## 18. OpenAPI starter outline

```yaml
openapi: 3.0.3
info:
  title: Maple Ledger Provenance API
  version: 1.0.0
servers:
  - url: /api/v1
paths:
  /verifications:
    post:
      summary: Create verification
  /verifications/{verification_id}:
    get:
      summary: Get verification result
  /verifications/{verification_id}/graph:
    get:
      summary: Get supply-chain graph
  /verifications/{verification_id}/breakdown:
    get:
      summary: Get Canadian content breakdown
  /verifications/{verification_id}/anomalies:
    get:
      summary: Get anomalies
  /attestations:
    get:
      summary: List attestations
  /attestations/{attestation_id}:
    get:
      summary: Get attestation
  /attestations/drafts:
    post:
      summary: Create attestation draft
```

The challenge endpoint should also exist at root-level:

```yaml
/verify:
  post:
    summary: Challenge-compatible verification endpoint
```

---

## 19. Final build recommendation

Build in this order:

1. `verify_payload(payload)` pure function.
2. `POST /verify` challenge endpoint.
3. Purchaser verification result page.
4. Supplier create-attestation wizard.
5. Graph visualization.
6. Anomaly explanation panel.
7. Report export.

This order maximizes both autograder performance and judge-visible product value.

