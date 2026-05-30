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

| Token     |       Hex | Usage                                                                |
| --------- | --------: | -------------------------------------------------------------------- |
| `navy`    | `#26374A` | Header bars, primary navigation, serious government/procurement tone |
| `paper`   | `#FFFFFF` | Main surface, cards, panels                                          |
| `paper-2` | `#F4F5F6` | App background, muted sections, table striping                       |
| `ink`     | `#1F2933` | Primary text                                                         |
| `ink-2`   | `#5C6670` | Secondary text, helper copy                                          |
| `ink-3`   | `#9AA0A6` | Disabled text, timestamps, metadata                                  |
| `line`    | `#E1E4E7` | Card borders, dividers                                               |
| `line-2`  | `#CDD2D7` | Stronger borders, table grid, form outlines                          |
| `red`     | `#D52B1E` | Rare emphasis, critical anomalies, maple-leaf brand accent           |
| `ok`      | `#1F7A4D` | Verified states, valid chain, success badges                         |

### Typography

| Font           | Weight  | Usage                                              |
| -------------- | ------- | -------------------------------------------------- |
| Space Grotesk  | 400     | Body text, table text                              |
| Space Grotesk  | 500     | Form labels, card titles                           |
| Space Grotesk  | 600     | Section titles, tabs, buttons                      |
| Space Grotesk  | 700     | Page headers, key metrics                          |
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

* who performed the work,
* where the work happened,
* what inputs were consumed,
* what output was produced,
* direct material and labour costs,
* labour hours,
* cryptographic signature,
* content hash.

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

* Supplier
* User
* Attestation
* Parent input reference
* Product / output
* Verification result
* Anomaly
* Registry anchor
* Report

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

* Challenge autograder
* Purchaser UI verification flow
* Supplier verification preview

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

* Supplier Dashboard

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

* My Attestations
* Parent Input Search
* Verification Result Attestations tab

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

* Supplier Attestation Detail
* Purchaser Node Detail Panel

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

* Create Attestation > Review & Sign

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

* Purchaser Dashboard

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

* saved history,
* graph data,
* dashboard metrics,
* report generation,
* detailed UI panels.

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

* Verification Result > Supply Chain Graph

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

* Create Attestation
* View Drafts
* Open My Attestations
* Preview Verification

### Layout

```text
Top bar: navy
Left sidebar: paper surface
Main canvas: paper-2 background
Metric cards: paper cards with line border
```

### Content sections

1. Metric cards

   * Signed Attestations
   * Pending Drafts
   * Products Supplied
   * Verification Issues
   * Key Verified

2. Recent Activity

   * signed attestations
   * parent input additions
   * purchaser verifications
   * draft warnings

3. Attestations by Type

   * raw material supply
   * component manufacture
   * subassembly
   * final integration

4. Verification Status

   * valid
   * warning
   * invalid

### API dependencies

* `GET /api/v1/me`
* `GET /api/v1/supplier/dashboard`
* `GET /api/v1/attestations`

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

* Product name
* Product ID
* Quantity produced
* Unit
* Batch / lot number

### Step 2: Action Type

Card choices:

* Raw Material Supply
* Component Manufacture
* Subassembly
* Final Integration

Each card includes helper text.

### Step 3: Location

Fields:

* Performed in country
* Facility name
* City
* Province / state

Helper text:

```text
Canadian content is based on where the work was performed, not where the supplier is headquartered.
```

### Step 4: Parent Inputs

Functions:

* Add parent manually
* Search parent attestations
* Scan QR code
* Upload parent JSON

Table columns:

* Parent attestation ID
* Product
* Quantity consumed
* Unit
* Hash status
* Actions

Validation hints:

* Unit must match parent output unit.
* Total consumed cannot exceed produced quantity.

### Step 5: Costs

Fields:

* Material cost CAD
* Labour cost CAD
* Labour hours

Live calculations:

* Direct production cost
* Canadian contribution
* Substantial transformation: yes/no

### Step 6: Review & Sign

Review panel:

* Supplier
* Action
* Location
* Parent count
* Direct cost
* Labour hours
* Substantial transformation
* Content hash preview

Actions:

* Generate Content Hash
* Sign Attestation
* Download JSON
* Generate QR

### API dependencies

* `POST /api/v1/attestations/drafts`
* `PATCH /api/v1/attestations/drafts/{draft_id}`
* `POST /api/v1/attestations/drafts/{draft_id}/preview`
* `POST /api/v1/attestations/drafts/{draft_id}/sign`
* `GET /api/v1/attestations/{attestation_id}/qr`

---

## 11.3 Supplier Attestation Detail

### Purpose

Shows the completed signed attestation and its technical metadata.

### Main sections

1. Header

   * Attestation ID
   * Signed badge
   * Download JSON
   * More actions

2. Attestation summary

   * Output
   * Product type
   * Quantity
   * Created timestamp
   * Supplier
   * Signer
   * Signature status
   * Content hash
   * Hash algorithm

3. QR panel

   * QR code
   * Download JSON

4. Parents

   * Parent attestation chips

5. Costs

   * Material cost
   * Labour cost
   * Labour hours

6. Technical metadata

   * Schema version
   * Hash algorithm
   * Registry status
   * Chain ID
   * Attestation hash

### API dependencies

* `GET /api/v1/attestations/{attestation_id}`
* `GET /api/v1/attestations/{attestation_id}/qr`
* `POST /api/v1/verifications`

---

## 11.4 Purchaser Dashboard

### Purpose

Give procurement users a quick verification command center.

### Primary actions

* Scan QR Code
* Verify Product
* Upload JSON Chain
* View Recent Verifications

### Content sections

1. Metric cards

   * Products Verified
   * Valid Chains
   * Invalid Chains
   * Made in Canada
   * Product of Canada

2. Verification input

   * Paste product attestation ID
   * Verify button
   * Upload JSON file

3. Recent Verifications

   * product name
   * designation badge
   * timestamp
   * valid/invalid badge

4. Supplier Risk Overview

   * low / medium / high risk counts

5. Policy Compliance

   * Buy Canadian threshold
   * Product of Canada threshold

### API dependencies

* `GET /api/v1/me`
* `GET /api/v1/purchaser/dashboard`
* `POST /api/v1/verifications`
* `GET /api/v1/verifications`

---

## 11.5 Verification Result

### Purpose

Show whether the product claim is valid, why it qualifies or fails, and where anomalies exist.

### Top summary

* Product name
* Product attestation ID
* Verification timestamp
* Download Report
* Share

### Primary result cards

1. Canadian Content

   * percentage
   * ring chart

2. Designation

   * `Made in Canada`
   * `Product of Canada`
   * `None`

3. Chain Validity

   * valid / invalid

4. Supporting metrics

   * attestations checked
   * suppliers involved
   * countries involved
   * anomalies detected

### Tabs

1. Supply Chain Graph
2. Canadian Content Breakdown
3. Anomalies
4. Attestations
5. Details

### API dependencies

* `GET /api/v1/verifications/{verification_id}`
* `GET /api/v1/verifications/{verification_id}/graph`
* `GET /api/v1/verifications/{verification_id}/breakdown`
* `GET /api/v1/verifications/{verification_id}/anomalies`
* `POST /api/v1/verifications/{verification_id}/reports`

---

## 11.6 Supply Chain Graph

### Purpose

Make the provenance chain understandable visually.

### Node states

| State                           | Color             | Meaning                                |
| ------------------------------- | ----------------- | -------------------------------------- |
| Valid Canadian contribution     | ok                | Verified and performed in Canada       |
| Valid non-Canadian contribution | neutral/blue-gray | Verified but not Canadian contribution |
| Pending / unknown               | ink-3             | Missing optional data or unanchored    |
| Warning                         | muted amber       | Statistical or semantic concern        |
| Invalid                         | red               | Hard-rule violation                    |

### Node fields

* Product name
* Attestation ID
* Country
* Cost
* Quantity produced
* Signature status
* Hash status
* Anomaly count

### Edge fields

* Quantity consumed
* Unit
* Hash status

### Interactions

* Click node: open attestation side panel.
* Click edge: show parent hash verification details.
* Filter: valid / warning / invalid.
* Zoom and pan.
* Fit to screen.

---

## 11.7 Anomaly Panel

### Purpose

Explain exactly what went wrong and what the purchaser should do next.

### Severity levels

| Severity | Meaning                           |
| -------- | --------------------------------- |
| Critical | Chain should not be trusted       |
| Warning  | Claim may be valid but suspicious |
| Info     | Non-blocking context              |

### Required fields

* Type
* Severity
* Affected attestation
* Explanation
* Recommendation

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

| Country | Direct cost |   Share |
| ------- | ----------: | ------: |
| CA      |    `$7,340` | `73.4%` |
| US      |    `$2,660` | `26.6%` |

3. Cost type table

| Cost type | Canadian | Non-Canadian |
| --------- | -------: | -----------: |
| Material  | `$4,200` |     `$2,100` |
| Labour    | `$3,140` |       `$560` |

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

## 11A. Detailed UI layout, alignment, and visual specification

This section documents the exact layout language shown in the mockup. Use it as the implementation guide for spacing, grid, alignment, cards, tables, graph panels, and responsive behavior.

---

# 11A.1 Global app shell

All five screens use the same base shell.

```text
┌──────────────────────────────────────────────────────────────┐
│ Top navy context bar                                          │
├───────────────┬──────────────────────────────────────────────┤
│ Left sidebar  │ Main content canvas                           │
│ 144–176 px    │ Fluid width                                   │
└───────────────┴──────────────────────────────────────────────┘
```

## Top navy bar

| Property           | Value                                        |
| ------------------ | -------------------------------------------- |
| Height             | `44–52 px`                                   |
| Background         | `navy #26374A`                               |
| Text               | `paper #FFFFFF`                              |
| Horizontal padding | `16–24 px`                                   |
| Title font         | Space Grotesk `700`                          |
| Subtitle font      | Space Grotesk `400/500`                      |
| Purpose            | Shows portal type and current screen context |

Example labels:

```text
SUPPLIER PORTAL · Dashboard
Create & sign attestations
```

```text
PURCHASER / VERIFIER PORTAL · Verification Result
Provenance, Canadian content & anomalies
```

## Left sidebar

| Property           | Value                     |
| ------------------ | ------------------------- |
| Width              | `144–176 px`              |
| Background         | `paper #FFFFFF`           |
| Border right       | `1 px solid line #E1E4E7` |
| Top padding        | `16 px`                   |
| Horizontal padding | `12 px`                   |
| Logo block height  | `64–72 px`                |
| User profile card  | pinned to bottom          |

Sidebar order:

```text
Logo
Organization name
Verification badge
Navigation
User card
```

Supplier navigation:

```text
Dashboard
Create Attestation
My Attestations
Products
Parent Inputs
Keys & Identity
Verification Preview
```

Purchaser navigation:

```text
Dashboard
Verify Product
Verification History
Supplier Risk
Policy Reports
Settings
```

## Main canvas

| Property   | Value                                                                      |
| ---------- | -------------------------------------------------------------------------- |
| Background | `paper-2 #F4F5F6` for dashboards, `paper #FFFFFF` for dense result screens |
| Padding    | `20–24 px`                                                                 |
| Grid gap   | `12–16 px`                                                                 |
| Max width  | Optional `1440 px`                                                         |

---

# 11A.2 Spacing system

Use an 8-point spacing system.

| Token     |   Value | Usage                             |
| --------- | ------: | --------------------------------- |
| `space/1` |  `4 px` | icon/text gaps, tiny offsets      |
| `space/2` |  `8 px` | badge padding, tight row gaps     |
| `space/3` | `12 px` | table cells, sidebar item padding |
| `space/4` | `16 px` | card padding, card gaps           |
| `space/5` | `20 px` | page gutters                      |
| `space/6` | `24 px` | large section gaps                |
| `space/8` | `32 px` | major vertical separation         |

Alignment rules:

1. Page title aligns to the main grid left edge.
2. Primary page action aligns to the main grid right edge.
3. Metric cards share equal height and baseline.
4. Card titles always start `16 px` from the card left edge.
5. Tables use left-aligned labels and right-aligned numeric values.
6. IDs, hashes, signatures, and schema values use JetBrains Mono.
7. Red is reserved for critical states and should not be used as decoration.

---

# 11A.3 Core components

## Cards

| Property   | Value                     |
| ---------- | ------------------------- |
| Background | `paper #FFFFFF`           |
| Border     | `1 px solid line #E1E4E7` |
| Radius     | `10–12 px`                |
| Padding    | `16 px`                   |
| Shadow     | none or extremely subtle  |

Cards should look like official evidence panels, not flashy marketing blocks.

## Metric cards

```text
┌────────────────────┐
│ 42                 │
│ Signed Attestations│
│ This month         │
└────────────────────┘
```

| Property    | Value                           |
| ----------- | ------------------------------- |
| Height      | `76–92 px`                      |
| Metric size | `24–28 px`, Space Grotesk `700` |
| Label size  | `12–13 px`, Space Grotesk `600` |
| Helper size | `11–12 px`, `ink-2`             |

## Buttons

Primary button:

| Property   | Value                          |
| ---------- | ------------------------------ |
| Height     | `32–40 px`                     |
| Background | `navy #26374A` or `ok #1F7A4D` |
| Text       | `paper #FFFFFF`                |
| Radius     | `6–8 px`                       |
| Font       | Space Grotesk `600`            |
| Padding    | `12–16 px` horizontal          |

Secondary button:

| Property   | Value            |
| ---------- | ---------------- |
| Background | `paper #FFFFFF`  |
| Border     | `line-2 #CDD2D7` |
| Text       | `ink #1F2933`    |

Button placement:

```text
Page-level actions: top-right
Wizard actions: bottom-right inside card
Table row actions: far-right column
```

## Badges

| Badge              | Visual treatment                             |
| ------------------ | -------------------------------------------- |
| Verified Supplier  | pale green background, `ok` text             |
| Verified Purchaser | pale green background, `ok` text             |
| Signed             | pale green background, `ok` text             |
| Made in Canada     | pale green background, `ok` text             |
| Product of Canada  | pale green background, `ok` text             |
| None               | pale red or neutral background, red/ink text |
| Invalid            | pale red background, `red` text              |

## Tables

| Property      | Value                                    |
| ------------- | ---------------------------------------- |
| Header height | `32–36 px`                               |
| Row height    | `40–48 px`                               |
| Cell padding  | `10–12 px`                               |
| Header font   | `11–12 px`, Space Grotesk `600`, `ink-2` |
| Body font     | `12–13 px`, Space Grotesk `400/500`      |
| ID font       | JetBrains Mono `11–12 px`                |

---

# 11A.4 Screen 1 — Supplier Portal Dashboard

## Purpose

Operational overview for the supplier: signed attestations, drafts, products, verification issues, and key status.

## Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Navy top bar                                                │
├──────────────┬──────────────────────────────────────────────┤
│ Sidebar      │ Header row: title + Create Attestation       │
│              │ Metric row: 5 equal cards                    │
│              │ Recent Activity       | Attestations by Type │
│              │ Top Products          | Verification Status  │
└──────────────┴──────────────────────────────────────────────┘
```

## Header row

| Element                | Alignment                         |
| ---------------------- | --------------------------------- |
| `Dashboard` title      | top-left                          |
| Subtitle               | directly below title              |
| `+ Create Attestation` | top-right, aligned to title block |

## Metric row

Five equal-width cards:

```text
Signed Attestations | Pending Drafts | Products Supplied | Verification Issues | Key Verified
```

All metric cards must have the same height and equal gaps.

## Content grid

Use two columns:

```text
Left column: 60%
Right column: 40%
Gap: 16 px
```

Rows:

```text
Recent Activity  | Attestations by Type
Top Products     | Verification Status
```

## Recent Activity card

Row alignment:

```text
status icon | activity text | timestamp
```

* Icon: `12 px`
* Activity: left aligned
* Timestamp: right aligned, `ink-3`

## Attestations by Type card

* Donut chart centered left.
* Legend aligned right.
* Legend rows use `dot + label + count`.

## Verification Status card

Use one horizontal progress bar.

```text
[████████████████████████] 100%
Valid 42 · Warning 0 · Invalid 0
```

---

# 11A.5 Screen 2 — Supplier Portal Create Attestation

## Purpose

Step-by-step wizard for creating and signing an attestation.

## Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Navy top bar                                                │
├──────────────┬──────────────────────────────────────────────┤
│ Sidebar      │ Page title                                   │
│              │ Centered stepper                             │
│              │ Centered wizard card                         │
│              │ Footer actions inside card                   │
└──────────────┴──────────────────────────────────────────────┘
```

## Stepper

```text
1 Product / Output ─ 2 Action Type ─ 3 Location ─ 4 Parent Inputs ─ 5 Costs ─ 6 Review & Sign
```

| Element          | Style                             |
| ---------------- | --------------------------------- |
| Active circle    | navy fill, white number           |
| Completed circle | ok fill                           |
| Inactive circle  | paper fill, line-2 border         |
| Connector        | line-2                            |
| Label            | `10–11 px`, centered under circle |

## Wizard card

| Property  | Value                 |
| --------- | --------------------- |
| Width     | `720–860 px`          |
| Alignment | horizontally centered |
| Padding   | `20–24 px`            |

## Parent Inputs step

Card header:

```text
Parent Inputs                                      [+ Add Parent] [Scan QR]
Add or import raw materials that were consumed to produce this output.
```

Table columns:

| Column                | Alignment  | Width hint |
| --------------------- | ---------- | ---------: |
| Parent Attestation ID | left, mono |        24% |
| Product               | left       |        26% |
| Quantity Consumed     | right      |        16% |
| Unit                  | left       |        10% |
| Hash Status           | left       |        14% |
| Actions               | center     |        10% |

Validation callout:

```text
All consumed quantity must not exceed the available quantity of the parent output.
Units must match the parent output unit.
```

Use neutral/pale background unless blocking.

Footer actions:

```text
[Back]                                      [Next: Costs →]
```

---

# 11A.6 Screen 3 — Purchaser / Verifier Dashboard

## Purpose

Command center for product verification and policy compliance.

## Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Navy top bar                                                │
├──────────────┬──────────────────────────────────────────────┤
│ Sidebar      │ Header row + Scan QR + Verify Product        │
│              │ Metric row: 5 equal cards                    │
│              │ Verify Product card | Recent Verifications   │
│              │ Supplier Risk card | Policy Compliance       │
└──────────────┴──────────────────────────────────────────────┘
```

## Header actions

```text
[Scan QR Code] [+ Verify Product]
```

* Secondary button first.
* Primary button second.
* Both right aligned.

## Metric row

```text
Products Verified | Valid Chains | Invalid Chains | Made in Canada | Product of Canada
```

Use red only for `Invalid Chains`.

## Verify product card

```text
Verify a product attestation
[Paste product_attestation_id...] [Verify]

or upload JSON file
[Drop file here or click to upload]
```

Input is flexible width. Verify button has fixed width.

## Recent Verifications card

Row structure:

```text
small icon | product name | designation badge | timestamp | validity badge
```

Validity badge aligns to the far right.

## Supplier Risk card

* Donut chart left.
* Legend right.
* Center label: `Low Risk 92%`.

## Policy Compliance card

Two progress bars:

```text
Buy Canadian (≥51%)        Compliant 48/56
Product of Canada (≥98%)   Compliant 21/56
```

---

# 11A.7 Screen 4 — Supplier Portal Attestation Detail

## Purpose

Evidence view for a signed attestation.

## Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Navy top bar                                                │
├──────────────┬──────────────────────────────────────────────┤
│ Sidebar      │ Header: Attestation ID + Signed badge        │
│              │ Evidence card                  | QR card     │
│              │ Inputs card                    | Costs card  │
│              │ Technical Metadata full width                │
└──────────────┴──────────────────────────────────────────────┘
```

## Header

```text
Attestation: att-final-001 [Signed]                 [Download Report] [...]
```

* Attestation ID uses JetBrains Mono.
* Signed badge sits immediately after the ID.
* Actions align right.

## Evidence card

Use a three-column detail grid:

```text
Column 1: Output details
Column 2: Supplier / signer details
Column 3: Content hash / signature status
```

Detail item format:

```text
Label  — 11 px, ink-2
Value  — 13 px, ink, 500/600
```

## QR card

* QR image centered.
* Download JSON button centered below.
* Card width: `120–160 px`.

## Inputs and Costs row

```text
Inputs (3)                              Costs (CAD)
[att-raw-001] [att-comp-045] ...        Material | Labour | Hours
```

Input chips use JetBrains Mono.

## Technical Metadata

Full-width card with columns:

```text
Schema Version | Hash Algorithm | Recorded On | Chain ID | Attestation Hash
```

Use JetBrains Mono for schema, chain ID, and hash values.

---

# 11A.8 Screen 5 — Purchaser / Verifier Verification Result

## Purpose

Judge-facing result screen: proves validity, explains designation, shows graph, and exposes anomalies.

## Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Navy top bar                                                │
├─────────────────────────────────────────────────────────────┤
│ Back link + product title + actions                         │
│ Primary result card                                         │
│ Supporting metrics row                                      │
│ Tabs                                                        │
│ Supply chain graph                 | Anomaly panel          │
└─────────────────────────────────────────────────────────────┘
```

This screen may omit the left sidebar to maximize graph space.

## Header

```text
← Back to results
Drone Recon Kit ↗                                      [Download Report] [Share]
Product Attestation ID: att-final-001 · Verified Apr 25, 2025 10:24 AM
```

* Product title left.
* Actions right.
* Metadata below title in `ink-2`.

## Primary result card

Three equal columns:

```text
Canadian Content | Designation | Chain Validity
73.4%            | Made in Canada | Valid
```

Column details:

* Canadian Content: percentage large, green, ring chart aligned inside column.
* Designation: maple leaf icon as rare red accent, bold designation text.
* Chain Validity: shield/check icon in green, valid label.

## Supporting metrics

Four equal columns:

```text
Attestations Checked | Suppliers Involved | Countries Involved | Anomalies Detected
14                   | 6                  | 2                  | 0
```

## Tabs

```text
Supply Chain Graph | Canadian Content Breakdown | Anomalies | Attestations (14) | Details
```

Active tab:

* navy text
* `2 px` navy underline

Inactive tabs:

* `ink-2`

## Lower split panel

```text
Graph panel: 60–65%
Anomaly panel: 35–40%
Gap: 16 px
```

## Supply chain graph

Graph direction:

```text
Raw Materials → Components → Subassemblies → Final Product
```

Legend row:

```text
■ Canadian Contribution
■ Non-Canadian Contribution
■ Pending / Unknown
■ Issue / Invalid
```

Node sizing:

| Node type     |        Width |     Height |
| ------------- | -----------: | ---------: |
| Raw material  | `150–180 px` | `56–72 px` |
| Component     | `160–190 px` | `64–80 px` |
| Final product | `180–220 px` | `72–88 px` |

Node content:

```text
Product name
attestation_id
Country | cost | quantity
```

Node state styling:

| State              | Border             | Background   |
| ------------------ | ------------------ | ------------ |
| Canadian valid     | `ok`               | pale green   |
| Non-Canadian valid | blue-gray / line-2 | pale neutral |
| Warning            | amber              | pale amber   |
| Invalid            | red                | pale red     |

Edges:

* Flow left to right.
* Show quantity/unit near edge midpoint.
* Use neutral gray line by default.
* Use red edge if parent hash mismatch exists.

Graph controls:

```text
[+] [-] [fit]
```

Bottom-right of graph panel.

## Anomaly panel

Clean state:

```text
Anomalies (0)
No anomalies detected
This supply chain is clean and compliant.
```

Invalid state row:

```text
[Critical] Parent hash mismatch
Affected Attestation: att-comp-067
Recommendation: Request original upstream supplier attestation.
```

Critical rows use red sparingly: badge + icon only, not entire panel.

---

# 11A.9 Responsive behavior

## Desktop ≥ 1200 px

* Full sidebar.
* Five metric cards in one row.
* Two-column dashboard grids.
* Verification graph and anomaly panel side by side.

## Tablet 768–1199 px

* Sidebar collapses to icon-only.
* Metric cards wrap to 2–3 columns.
* Dashboard cards stack when needed.
* Verification graph appears above anomaly panel.

## Mobile < 768 px

* Sidebar becomes drawer.
* Metric cards stack vertically or two per row.
* Tables become horizontally scrollable.
* Graph switches to vertical flow:

```text
Raw Materials
↓
Components
↓
Final Product
```

Mobile should prioritize:

1. verification status,
2. Canadian content percentage,
3. designation explanation,
4. anomalies,
5. graph.

---

# 11A.10 Accessibility and usability

## Contrast

* White on navy and navy on white must meet WCAG AA.
* Never rely on color alone.
* Pair red/green with labels and icons.

## Keyboard behavior

* Sidebar items are keyboard-focusable.
* Wizard stepper supports keyboard navigation.
* Graph nodes should have an equivalent accessible table.
* Primary actions are reachable in logical order.

## Empty states

Good empty-state copy:

```text
No anomalies detected.
This supply chain is clean and compliant.
```

```text
No parent inputs added yet.
Add a parent attestation or continue only if this is a raw material supply.
```

## Error states

Use direct, plain explanations:

```text
Parent hash mismatch
This child attestation references a parent hash that does not match the submitted parent content.
```

Avoid vague messages like:

```text
Validation failed.
```

---

## 12. API-to-screen mapping

| Screen              | Required APIs                                                                    |
| ------------------- | -------------------------------------------------------------------------------- |
| Supplier Dashboard  | `GET /me`, `GET /supplier/dashboard`, `GET /attestations`                        |
| Create Attestation  | `POST /attestations/drafts`, `PATCH /drafts/{id}`, `POST /preview`, `POST /sign` |
| Attestation Detail  | `GET /attestations/{id}`, `GET /attestations/{id}/qr`                            |
| Purchaser Dashboard | `GET /purchaser/dashboard`, `POST /verifications`, `GET /verifications`          |
| Verification Result | `GET /verifications/{id}`, `GET /graph`, `GET /breakdown`, `GET /anomalies`      |
| Report Export       | `POST /reports`, `GET /reports/{id}/download`                                    |

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

| Type                         | Severity |
| ---------------------------- | -------- |
| `signature_invalid`          | critical |
| `signature_unknown_supplier` | critical |
| `parent_hash_mismatch`       | critical |
| `circular_reference`         | critical |
| `dangling_parent`            | critical |
| `timestamp_inversion`        | critical |
| `unit_mismatch`              | critical |
| `mass_balance_violation`     | critical |
| `replay_within_chain`        | critical |
| `schema_invalid`             | critical |
| `invalid_numeric_value`      | critical |
| `transformation_implausible` | warning  |
| `cost_anomaly`               | warning  |
| `t4_timing_outlier`          | warning  |
| `t4_origin_outlier`          | warning  |
| `t4_labour_outlier`          | warning  |
| `t4_cost_outlier`            | warning  |

---

## 15. Design principles

### 15.1 Make trust visible

Every key trust operation should have a visible status:

* signature valid / invalid,
* hash valid / invalid,
* supplier known / unknown,
* chain valid / invalid,
* Canadian contribution yes / no.

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

* critical anomalies,
* invalid chain,
* destructive warnings,
* maple-leaf brand accent.

Use `ok #1F7A4D` for valid verification states.

### 15.5 Use mono text for evidence

Use JetBrains Mono for:

* attestation IDs,
* hashes,
* signatures,
* schema labels,
* product IDs.

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

* `GET /api/v1/supplier/dashboard`
* `GET /api/v1/attestations`
* `POST /api/v1/attestations/drafts`
* `PATCH /api/v1/attestations/drafts/{draft_id}`
* `POST /api/v1/attestations/drafts/{draft_id}/preview`
* `POST /api/v1/attestations/drafts/{draft_id}/sign`
* `GET /api/v1/attestations/{attestation_id}`

### Purchaser MVP

Screens:

1. Purchaser Dashboard
2. Verify Product
3. Verification Result with Graph and Anomaly Panel

APIs:

* `POST /verify`
* `GET /api/v1/purchaser/dashboard`
* `POST /api/v1/verifications`
* `GET /api/v1/verifications/{verification_id}`
* `GET /api/v1/verifications/{verification_id}/graph`
* `GET /api/v1/verifications/{verification_id}/breakdown`
* `GET /api/v1/verifications/{verification_id}/anomalies`

---

## 17. Demo script

### Step 1: Supplier creates evidence

A supplier logs in, creates a final integration attestation, adds parent inputs, enters Canadian labour and material costs, then signs the attestation.

### Step 2: Purchaser verifies product

A purchaser scans the QR code or pastes the product attestation ID.

The result shows:

* chain valid,
* Canadian content percentage,
* designation,
* supply-chain graph,
* no anomalies.

### Step 3: Tampering demo

The demo modifies an upstream parent cost or product field.

The result shows:

* parent hash mismatch,
* affected graph node highlighted,
* recommendation to request original upstream evidence.

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
