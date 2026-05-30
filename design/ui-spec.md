# Maple Ledger · UI Spec (for the frontend build)

> Feed this whole file to your build AI, or read it top to bottom before wiring screens.
> Visual reference: the four screenshots in `design/screenshots/`. Token reference:
> `design/design-tokens.md` and the Figma file (link in `design/README.md`).
> Visual language: canada.ca (light, government-grade, calm). NOT dark. NOT decorative.
>
> If a screenshot and a token ever disagree, the token wins. The tokens are also authored as
> native Figma variables (collection "Maple Ledger · Tokens", Light mode).

---

## 1. Design tokens (summary · full table in design-tokens.md)

### Colour (hex · role)

| token | hex | role |
|---|---|---|
| navy | `#26374A` | primary · headers · active nav · primary buttons · key numbers |
| navy-2 | `#33475E` | navy hover / deeper accent |
| white | `#FFFFFF` | cards · sidebar · topbar |
| paper | `#F4F5F6` | app / body background |
| ink | `#1F2933` | body text |
| ink-2 | `#5C6670` | secondary text |
| ink-3 | `#9AA0A6` | muted text · mono labels |
| line | `#E1E4E7` | hairline dividers |
| line-2 | `#CDD2D7` | card / input borders |
| red | `#D52B1E` | RARE · only: imported or foreign items, out-of-scope mark, the brand dot, anomaly delta |
| ok | `#1F7A4D` | success / verified |
| tint-navy | `#EDF1F4` | active-nav bg · subtle navy wash |
| tint-red | `#FBEDEC` | imported-node bg |
| tint-ok | `#EAF3EE` | success-tag bg |

Red discipline: if more than roughly three red elements are on screen, it is overused. Red marks
foreign / failure / anomaly only.

### Type

- **Space Grotesk** : all UI text. Weights 400 / 500 / 600 / 700.
- **JetBrains Mono** : labels, codes, hashes, section eyebrows, table headers (`.mono`).
- **Noto Sans SC** : CJK fallback.
- Page title: 29px / 700. Section eyebrow (mono): 11px / letter-spacing .13em / uppercase / navy.
  Card title: 16 to 23px / 700. Body: 13.5 to 15px / 400. Mono labels: 9 to 11px.

### Spacing / shape

- 4px base grid. Card padding 18 to 22px. Field padding 14 to 16px.
- Radius: 6 to 10px cards · 4px buttons and inputs · 3px chips and tags.
- Border: 1px `line-2`. Card top-accent: 3px `navy` (or `red` for the cost / anomaly card).
- Card shadow (optional, subtle): in the range `0 8px 22px rgba(38,55,74,.06)` to `rgba(38,55,74,.13)`.

### Icons

Use **Lucide** (lucide.dev · MIT · github.com/lucide-icons/lucide) for ALL UI icons (lock, eye,
eye-off, shield, search, file-text, check, alert-triangle, link, qr-code, fingerprint). Line icons,
1.5 to 2px stroke, colour `navy` / `ink-2` (red only for anomaly). Do NOT use emoji or unicode glyphs
(they render inconsistently).

---

## 2. App shell (shared by all three workspaces · 1440×900 reference)

- **Left sidebar · 214px · white · 1px right border `line`.**
  - Brand: a 9px `red` dot + "Maple Ledger" (700, 18px), top, 24px padding.
  - Nav (3 items): `Supplier` / `Purchaser` / `Auditor`. Each = title (600, 15px) + mono sub-label.
    Active item: `tint-navy` bg + 3px `navy` left border + navy title.
  - Bottom: "TEAM TRUENORTH" (mono, ink-2) + member names (mono 10px, ink-3):
    **Ashton (Zhengshen) Shu · Sikai Han · Laxman KC**.
- **Topbar · 54px · white · 1px bottom border `line`.**
  - Left: console context, mono 11px / .16em / uppercase / ink-3
    (e.g. "PURCHASER CONSOLE · DEFENCE + DUAL-USE").
  - Right: "Ashton (Zhengshen) Shu · Team TrueNorth" (mono 11px, ink-2).
- **Body**: `paper` bg, 24 to 30px padding.
- **Footer line**: "Mock data shown · structure adapts to event-day spec" (mono 11px, ink-3).

---

## 3. Workspace · Supplier : "Issue attestation"

Screenshot: `design/screenshots/console-supplier.png`.

Subtitle: "Sign for your contribution. One supplier · one job · one signed record."
Two columns (form ~1fr | preview ~430px).

**Left form** (white fields, 1px `line-2`, radius 5px):
- SIGNING AS: "✓ SUP-MOTOR · Acme Motors Inc." + sub "Verified ISED supplier · hardware-key bound".
- OUTPUT: "motor_housing · 10 units".
- INPUTS CONSUMED: rows "✓ raw_aluminum … 5 kg … SUP-RAW-01", "✓ steel_bearings … 20 unit …
  SUP-BEAR-04" (ref code mono, right-aligned, muted).
- MATERIALS (CAD) "$0"  |  LABOUR (CAD) "$300" (two fields side by side).
- COUNTRY: "CA · Canada".
- STEP TYPE: pills MATERIAL / TRANSFORM (selected: navy outline + tint) / ASSEMBLE + checkbox
  "Last substantial transformation in Canada".
- Primary button: navy "Sign & submit →" + note "Signing key bound to hardware · never leaves your
  device".
- NO component-class / criticality field (cut feature, omit).

**Right preview** (paper panel, mono): label "ATTESTATION PREVIEW · WHAT WILL BE SIGNED" + a JSON block
(type / issuer / subject / inputs / cost / performedInCanada / stepType / lastSubstantialTransformation
/ timestamp) + a green success box "✓ ATTESTATION ISSUED · att-1734 · a3f1c8…e9b2 · in transparency
log".

---

## 4. Workspace · Purchaser : "Verify origin" (the hero / money screen)

Screenshot: `design/screenshots/console-purchaser.png`.

Subtitle: "Scan a QR or paste a hash. We compute the math against the attestation chain."
Layout: scan row, then two columns (left 1fr | right ~322px).

- **Scan row**: navy "SCAN QR CODE" button (with a QR glyph) · "OR" · hash input
  "drone_X1:7e4f2a3c811b9d5f" (mono).
- **DESIGNATION card** (white, 4px navy left border): label "DESIGNATION" · big navy "Made in Canada"
  (42px / 700) · meta "81% Canadian content · ≥ 51% threshold · last substantial transformation in
  Canada ✓" · a progress bar (navy fill 81% on paper track) · "CA $560 · 81%" / "OTHER $130 · 19%".
- **PROVENANCE CHAIN** card: "7 NODES VERIFIED · 0 ANOMALIES" · node chips left to right:
  Frame $130·CA, Motor $200·CA, Battery $230·CA, **Imported chip $130·CN (red, tint-red bg)** →
  Flight ctrl $260·50% CA, Powertrain $430·CA → **Drone $690·81% CA (navy filled)**. Arrows between
  tiers.
- **THREAT MODEL panel** (right): "4 FRAUDS · COVERAGE" · Identity ✓ FULL COVER · Activity ◐ PARTIAL
  · Cost / mass balance ◐ PARTIAL · Substitution ✗ OUT OF SCOPE · footer "Honest: of the four, we
  cover three." Use Lucide check / circle-half / x; tags: ok-tint / paper / red-tint.
- **EU DPP card** (bottom): "EU DPP-COMPATIBLE" · "Export as Digital Product Passport" + a line +
  outline button "EXPORT DPP →".

---

## 5. Workspace · Auditor : "Walk the chain" + the two NEW features

Screenshots: `design/screenshots/console-auditor.png` (current build) and
`console-auditor-fancy.png` (the richer concept · matches Figma node 143-2).

Subtitle: "Replay every signature and reconciliation. Anomalies surface; the verdict stays
deterministic." Current panels (keep): THREAT MODEL (2×2 coverage) · TRANSPARENCY LOG (append-only
rows; the imported_chip row in red with an alert icon) · RECONCILIATION · MASS BALANCE (three figures
0.87 / 0.62 / **+0.25 red** + buttons "Mark reviewed" navy-outline, "Escalate: quantity mismatch"
red-outline).

**NEW : add these two to the Auditor (the rework the deck pages p16 / p17 explain):**

### 5A. Visibility tiers (role-based, with locks)

A matrix or per-row treatment: data fields × viewer roles, with lock states. Reference matrix
(✓ visible / locked via Lucide `lock`):

| field | Public | Border (CBSA) | Prime contractor | Administrator |
|---|---|---|---|---|
| Designation (Made in Canada) | ✓ | ✓ | ✓ | ✓ |
| Canadian-content % | ✓ | ✓ | ✓ | ✓ |
| Provenance chain | lock | ✓ | ✓ | ✓ |
| Supplier cost breakdown | lock | lock | lock | ✓ |
| Supplier identity | lock | ✓ | ✓ | ✓ |

Behaviour: the logged-in role determines which rows render; hidden rows show a Lucide `lock` + a
"need-to-know" tooltip, NOT the data. The chain stays cryptographically verifiable for everyone; only
the *detail* is gated. (Planned. Present as roadmap; if built, show real lock states.)

### 5B. Classification (label, not rank)

The advisory AI tags each part by **category**: `structural · propulsion · sensing · compute · power`.
Show the category as a small chip next to each node / part. We classify; we do not rank importance
(that is a policy call and differs by buyer). Two 81% chains can carry very different risk (one
imported a Compute chip, one a Structural bracket). (Planned. Present as roadmap.)

---

## 6. Component states / behaviour

- Inputs: rest (1px line-2) · focus (1px navy). Buttons: navy fill primary · navy / red outline
  secondary.
- Nav active = tint-navy + navy left-border. Hover rows: paper.
- Verdict logic (deterministic, never AI): % = Σ(performed-in-Canada cost) ÷ Σ(total cost), integer
  cents. Designation: 51% → Made in Canada, 98% → Product of Canada, AND last substantial
  transformation in Canada; else "none".
- Red ONLY on: imported / foreign nodes, out-of-scope mark, anomaly delta, the brand dot.

---

## 7. How to use this

1. Build the shell once (sidebar + topbar + footer); reuse across the 3 workspaces.
2. Match the four screenshots in `design/screenshots/` for exact spacing and layout. The live
   `frontend/` in this repo is the running reference; inspect it for markup.
3. Tokens are in `design/design-tokens.md` and also in the Figma file as native variables
   (collection "Maple Ledger · Tokens", Light mode).
4. Lucide for every icon. Space Grotesk + JetBrains Mono via Google Fonts (Noto Sans SC for CJK).
5. Features 5A / 5B are roadmap. Wire the UI states if time allows; otherwise they are spoken or shown
   as planned.

*Source: Team TrueNorth · Maple Ledger · 2026-05-30. Visual reference: the four screenshots + the
Figma file.*
