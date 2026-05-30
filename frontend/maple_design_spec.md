# Maple Design — App and UI Specification

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

## Verification result example

```json
{
  "product_attestation_id": "att-final-001",
  "canadian_content_percentage": 73.4,
  "designation": "made_in_canada",
  "chain_valid": true,
  "anomalies": []
}
```

## Required behavior

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

## Canadian-content formula

```text
Canadian direct cost / total direct cost * 100
```

Where direct cost is:

```text
material_cad + labour_cost_cad
```

Do not use `labour_hours` as money.

## Designation rules

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
  otherwise
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
Canadian content is based on where the work was performed, not where the company is headquartered.
```

### Step 4: Parent Inputs

Parent inputs represent consumed upstream materials or components.

Expected columns:

- Parent attestation ID
- Product
- Quantity consumed
- Unit
- Hash status
- Actions

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

## 11.3 Supplier Attestation Detail

### Purpose

Shows the completed signed attestation and its technical metadata.

### Main sections

1. Header
   - Attestation ID
   - Signed badge
   - Download Report action
2. Evidence card
   - Output details
   - Supplier / signer details
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
2. Verify Product
   - Attestation ID input
   - JSON upload
   - Verify action
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

### Sections

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
The child attestation references a parent hash that does not match the actual parent.
Recommendation: Request the original upstream supplier attestation.
```

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
| CA | $7,340 | 73.4% |
| US | $2,660 | 26.6% |

3. Cost type table

| Cost type | Canadian | Non-Canadian |
|---|---:|---:|
| Material | $4,200 | $2,100 |
| Labour | $3,140 | $560 |

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

# 11A. Detailed UI layout, alignment, and visual specification

This section documents the exact layout language shown in the mockup. Use it as the implementation guide for spacing, grid, alignment, cards, tables, graph panels, and responsive behavior.

## 11A.1 Global app shell

All five screens use the same base shell.

```text
┌──────────────────────────────────────────────────────────────┐
│ Top navy context bar                                         │
├───────────────┬──────────────────────────────────────────────┤
│ Left sidebar  │ Main content canvas                          │
│ 144–176 px    │ Fluid width                                  │
└───────────────┴──────────────────────────────────────────────┘
```

### Top navy bar

| Property | Value |
|---|---|
| Height | `44–52 px` |
| Background | `navy #26374A` |
| Text | `paper #FFFFFF` |
| Horizontal padding | `16–24 px` |
| Title font | Space Grotesk `700` |
| Subtitle font | Space Grotesk `400/500` |
| Purpose | Shows portal type and current screen context |

Example labels:

```text
SUPPLIER PORTAL · Dashboard
Create & sign attestations

PURCHASER / VERIFIER PORTAL · Verification Result
Provenance, Canadian content & anomalies
```

### Left sidebar

| Property | Value |
|---|---|
| Width | `144–176 px` |
| Background | `paper #FFFFFF` |
| Border right | `1 px solid line #E1E4E7` |
| Top padding | `16 px` |
| Horizontal padding | `12 px` |
| Logo block height | `64–72 px` |
| User profile card | pinned to bottom |

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

### Main canvas

| Property | Value |
|---|---|
| Background | `paper-2 #F4F5F6` for dashboards; `paper #FFFFFF` for dense result screens |
| Padding | `20–24 px` |
| Width | fluid |

## 11A.2 Spacing system

Use an 8-point spacing system.

| Token | Value | Usage |
|---|---:|---|
| `space/1` | `4 px` | icon/text gaps, tiny offsets |
| `space/2` | `8 px` | badge padding, tight row gaps |
| `space/3` | `12 px` | table cells, sidebar item padding |
| `space/4` | `16 px` | card padding, card gaps |
| `space/5` | `20 px` | page gutters |
| `space/6` | `24 px` | large section gaps |
| `space/8` | `32 px` | major vertical separation |

Alignment rules:

1. Page title aligns to the main grid left edge.
2. Primary page action aligns to the main grid right edge.
3. Metric cards share equal height and baseline.
4. Card titles always start `16 px` from the card left edge.
5. Tables use left-aligned labels and right-aligned numeric values.
6. IDs, hashes, signatures, and schema values use JetBrains Mono.
7. Red is reserved for critical states and should not be used as decoration.

## 11A.3 Core components

### Cards

| Property | Value |
|---|---|
| Background | `paper #FFFFFF` |
| Border | `1 px solid line #E1E4E7` |
| Radius | `10–12 px` |
| Padding | `16 px` |
| Shadow | none or extremely subtle |

Cards should look like official evidence panels, not flashy marketing blocks.

### Metric cards

```text
┌──────────────────────┐
│ 42                   │
│ Signed Attestations  │
│ This month           │
└──────────────────────┘
```

| Property | Value |
|---|---|
| Height | `76–92 px` |
| Metric size | `24–28 px`, Space Grotesk `700` |
| Label size | `12–13 px`, Space Grotesk `600` |
| Helper size | `11–12 px`, `ink-2` |

### Buttons

Primary button:

| Property | Value |
|---|---|
| Height | `32–40 px` |
| Background | `navy #26374A` or `ok #1F7A4D` |
| Text | `paper #FFFFFF` |
| Radius | `6–8 px` |
| Font | Space Grotesk `600` |
| Padding | `12–16 px` horizontal |

Secondary button:

| Property | Value |
|---|---|
| Background | `paper #FFFFFF` |
| Border | `line-2 #CDD2D7` |
| Text | `ink #1F2933` |

Button placement:

```text
Page-level actions: top-right
Wizard actions: bottom-right inside card
Table row actions: far-right column
```

### Badges

| Badge | Treatment |
|---|---|
| Made in Canada | pale green background, `ok` text |
| Product of Canada | pale green background, `ok` text |
| None | pale red or neutral background, red/ink text |
| Invalid | pale red background, `red` text |

### Tables

| Property | Value |
|---|---|
| Header height | `32–36 px` |
| Row height | `40–48 px` |
| Cell padding | `10–12 px` |
| Header font | `11–12 px`, Space Grotesk `600`, `ink-2` |
| Body font | `12–13 px`, Space Grotesk `400/500` |
| ID font | JetBrains Mono `11–12 px` |

## 11A.4 Screen 1 — Supplier Portal Dashboard

### Purpose

Operational overview for the supplier: signed attestations, drafts, products, verification issues, and key status.

### Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Navy top bar                                                 │
├───────────────┬──────────────────────────────────────────────┤
│ Sidebar       │ Header row: title + Create Attestation       │
│               │ Metric row: 5 equal cards                    │
│               │ Recent Activity       │ Attestations by Type │
│               │ Top Products          │ Verification Status  │
└───────────────┴──────────────────────────────────────────────┘
```

### Header row

| Element | Alignment |
|---|---|
| `Dashboard` title | top-left |
| Subtitle | directly below title |
| `+ Create Attestation` | top-right, aligned to title block |

### Content grid

Use two columns:

```text
Left column: 60%
Right column: 40%
Gap: 16 px
```

Rows:

```text
Recent Activity | Attestations by Type
Top Products    | Verification Status
```

### Recent Activity card

Row alignment:

```text
status icon | activity text | timestamp
```

- Icon: `12 px`
- Activity: left aligned
- Timestamp: right aligned, `ink-3`

### Attestations by Type card

- Donut chart centered left.
- Legend aligned right.
- Legend rows use `dot + label + count`.

### Verification Status card

Use one horizontal progress bar.

```text
[────────────────────────] 100%
Valid 42 · Warning 0 · Invalid 0
```

## 11A.5 Screen 2 — Supplier Portal Create Attestation

### Purpose

Step-by-step wizard for creating and signing an attestation.

### Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Navy top bar                                                 │
├───────────────┬──────────────────────────────────────────────┤
│ Sidebar       │ Page title                                   │
│               │ Stepper                                      │
│               │ Wizard card                                  │
└───────────────┴──────────────────────────────────────────────┘
```

### Stepper

| Element | Treatment |
|---|---|
| Completed circle | `ok` fill |
| Inactive circle | `paper` fill, `line-2` border |
| Connector | `line-2` |
| Label | `10–11 px`, centered under circle |

### Wizard card

| Property | Value |
|---|---|
| Width | `720–860 px` |
| Alignment | horizontally centered |
| Padding | `20–24 px` |

### Parent Inputs step

Card header:

```text
Parent Inputs                                      [+ Add Parent] [Scan QR]
Add or import raw materials that were consumed to produce this output.
```

Table columns:

| Column | Alignment | Width hint |
|---|---|---:|
| Parent Attestation ID | left, mono | 24% |
| Product | left | 26% |
| Quantity Consumed | right | 16% |
| Unit | left | 10% |
| Hash Status | left | 14% |
| Actions | center | 10% |

Validation callout:

```text
All consumed quantity must not exceed the available quantity of the parent.
Units must match the parent output unit.
```

Use neutral/pale background unless blocking.

Footer actions:

```text
[Back]                                           [Next: Costs →]
```

## 11A.6 Screen 3 — Purchaser / Verifier Dashboard

### Purpose

Command center for product verification and policy compliance.

### Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Navy top bar                                                 │
├───────────────┬──────────────────────────────────────────────┤
│ Sidebar       │ Header row + Scan QR + Verify Product        │
│               │ Metric row: 5 equal cards                    │
│               │ Verify Product card | Recent Verifications   │
│               │ Supplier Risk card | Policy Compliance       │
└───────────────┴──────────────────────────────────────────────┘
```

### Header actions

```text
[Scan QR Code] [+ Verify Product]
```

- Secondary button first.
- Primary button second.
- Both right aligned.

### Metric row

```text
Products Verified | Valid Chains | Invalid Chains | Made in Canada | Product of Canada
```

Use red only for `Invalid Chains`.

### Verify product card

```text
Verify a product attestation
[Paste product_attestation_id...] [Verify]

or upload JSON file
[Drop file here or click to upload]
```

Input is flexible width. Verify button has fixed width.

### Recent Verifications card

Row structure:

```text
small icon | product name | designation badge | timestamp | validity badge
```

Validity badge aligns to the far right.

### Policy Compliance card

```text
Buy Canadian (≥51%)       Compliant 48/56
Product of Canada (≥98%)  Compliant 21/56
```

## 11A.7 Screen 4 — Supplier Portal Attestation Detail

### Purpose

Evidence view for a signed attestation.

### Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Navy top bar                                                 │
├───────────────┬──────────────────────────────────────────────┤
│ Sidebar       │ Header: Attestation ID + Signed badge        │
│               │ Evidence card              | QR card         │
│               │ Inputs card                | Costs card      │
│               │ Technical Metadata full width                │
└───────────────┴──────────────────────────────────────────────┘
```

### Header

```text
Attestation: att-final-001 [Signed]                   [Download Report] [...]
```

- Attestation ID uses JetBrains Mono.
- Signed badge sits immediately after the ID.
- Actions align right.

### Evidence card

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

### QR card

- QR image centered.
- Download JSON button centered below.
- Card width: `120–160 px`.

### Technical metadata

Full-width card with columns:

```text
Schema Version | Hash Algorithm | Recorded On | Chain ID | Attestation Hash
```

Use JetBrains Mono for schema, chain ID, and hash values.

## 11A.8 Screen 5 — Purchaser / Verifier Verification Result

### Purpose

Judge-facing result screen: proves validity, explains designation, shows graph, and exposes anomalies.

### Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Navy top bar                                                 │
├──────────────────────────────────────────────────────────────┤
│ Back link + product title + actions                          │
│ Primary result card                                          │
│ Supporting metrics row                                       │
│ Tabs                                                         │
│ Supply chain graph                         | Anomaly panel   │
└──────────────────────────────────────────────────────────────┘
```

This screen may omit the left sidebar to maximize graph space.

### Header

```text
← Back to results                                      [Download Report]
Drone Recon Kit ↗
Product Attestation ID: att-final-001 · Verified Apr 25, 2025 10:24 AM
```

- Product title left.
- Actions right.
- Metadata below title in `ink-2`.

### Primary result card

Three equal columns:

```text
Canadian Content | Designation    | Chain Validity
73.4%            | Made in Canada | Valid
```

Column details:

- Canadian Content: percentage large, green, ring chart aligned inside column.
- Designation: maple leaf icon as rare red accent, bold designation text.
- Chain Validity: shield/check icon in green with valid label.

---

## Notes

This Markdown file was created from the provided screenshots. Some screenshot edges were cropped; where visible text was cut off, the wording has been normalized to match the surrounding specification.
