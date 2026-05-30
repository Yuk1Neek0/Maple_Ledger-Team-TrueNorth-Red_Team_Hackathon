# Maple Ledger · Design Tokens

> System: canada.ca LIGHT. Government-grade, calm, editorial restraint. Not dark, not decorative.
> These are the canonical values. The same tokens are authored as native variables in the Figma
> file (collection "Maple Ledger · Tokens", Light mode), so a developer can pull them either from
> here or from Figma. The numbers are the source of truth; if a screenshot and a token disagree,
> the token wins.

---

## 1. Colour

| token | hex | role / usage |
|---|---|---|
| `navy` | `#26374A` | primary · headers · active nav · primary buttons · key numbers |
| `navy-2` | `#33475E` | navy hover / secondary navy · deeper accents |
| `paper` | `#F4F5F6` | app / body background |
| `white` | `#FFFFFF` | cards · sidebar · topbar surfaces |
| `ink` | `#1F2933` | primary body text |
| `ink-2` | `#5C6670` | secondary text |
| `ink-3` | `#9AA0A6` | muted text · mono labels |
| `red` | `#D52B1E` | RARE. alerts / anomalies ONLY (imported or foreign nodes, out-of-scope mark, anomaly delta, the brand dot) |
| `ok` | `#1F7A4D` | success / verified |
| `line` | `#E1E4E7` | hairline dividers |
| `line-2` | `#CDD2D7` | card / input borders |

### Optional tints (derived washes, used sparingly)

| token | hex | usage |
|---|---|---|
| `tint-navy` | `#EDF1F4` | active-nav background · subtle navy wash |
| `tint-red` | `#FBEDEC` | imported-node background |
| `tint-ok` | `#EAF3EE` | success-tag background |

**Red discipline.** Red is the loudest signal in the system, so it stays scarce. It marks only:
foreign / imported nodes, a failure or out-of-scope state, an anomaly delta, and the single brand dot.
If more than roughly three red elements are on one screen, red is overused. Everything else is navy,
ink, or ok-green.

---

## 2. Type

Load all three via Google Fonts.

| family | role |
|---|---|
| **Space Grotesk** | all UI text and headings. Weights 400 / 500 / 600 / 700. |
| **JetBrains Mono** | numbers, IDs, hashes, codes, labels, section eyebrows, table headers. The `.mono` class. |
| **Noto Sans SC** | CJK fallback for any Chinese text. |

Every number, ID, hash, ref code, and table header is mono. This is a hard rule, not a preference:
it is how the interface reads as an accounting / ledger tool rather than a marketing page.

### Scale (reference)

| element | size / weight | notes |
|---|---|---|
| Page title | 29px / 700 | Space Grotesk |
| Section eyebrow (mono) | 11px / 700 | letter-spacing .13em · UPPERCASE · navy |
| Card title | 16 to 23px / 700 | |
| Body | 13.5 to 15px / 400 | |
| Mono labels | 9 to 11px | ink-3, used for ref codes and field labels |

---

## 3. Spacing and shape

- **Grid:** 4px base. Generous whitespace is part of the look; do not crowd.
- **Card padding:** 18 to 22px. **Field padding:** 14 to 16px.
- **Radius:** 6 to 10px on cards · 4px on buttons and inputs · 3px on chips and tags.
- **Borders:** 1px hairline, `line-2` on cards and inputs, `line` on dividers.
- **Card top-accent:** 3px `navy` (or 3px `red` only on the cost / anomaly card).
- **Shadow (subtle, optional):** between `0 8px 22px rgba(38,55,74,.06)` and `rgba(38,55,74,.13)`.
  Shadows are faint by design; this is restraint, not a drop-shadow showcase.

---

## 4. Pattern rules (the house style)

- 1px hairline borders, never heavy rules.
- Subtle shadows only, in the `rgba(38,55,74,.06)` to `rgba(38,55,74,.13)` range.
- Radius 6 to 10px. Generous whitespace.
- Mono for all numbers and IDs, always.
- Red used sparingly, for anomalies and foreign nodes only.
- No gradient decoration. No neon. No dark mode for the consoles.
- canada.ca / editorial restraint throughout: the interface should feel like a calm government
  service, not a startup dashboard.

### Icons

Use **Lucide** (lucide.dev · MIT) for every UI icon: lock, eye, eye-off, shield, search, file-text,
check, alert-triangle, link, qr-code, fingerprint. Line icons, 1.5 to 2px stroke, coloured `navy`
or `ink-2` (red only for an anomaly). Do not use emoji or unicode glyphs in the UI; they render
inconsistently across platforms.

---

## 5. Verdict logic (deterministic · never AI)

The numbers on screen come from one formula, computed in integer cents to avoid floating-point drift:

```
Canadian-content % = Σ(performed-in-Canada cost) ÷ Σ(total cost)
```

Designation thresholds:

| threshold | designation | extra condition |
|---|---|---|
| ≥ 51% | **Made in Canada** | AND last substantial transformation in Canada |
| ≥ 98% | **Product of Canada** | AND last substantial transformation in Canada |
| below 51% | no designation | |

The verdict is the same every time for the same chain. Statistical anomaly detection is advisory
only and never changes the percentage or the designation.

---

*Source: Team TrueNorth · Maple Ledger · 2026-05-30.*
