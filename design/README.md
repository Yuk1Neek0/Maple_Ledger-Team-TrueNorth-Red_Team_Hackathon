# Maple Ledger · UI Design Handoff

This folder is the design source of truth for the Maple Ledger product UI. It holds everything you
need to build the three consoles: the live Figma file, the design tokens, the UI spec, and reference
screenshots. Everything is in this one folder so you can take it from here.

Visual language: **canada.ca, light, government-grade, calm**. Not dark, not decorative. Think a quiet
public-service tool, not a startup dashboard.

---

## Team · TrueNorth

- **Ashton (Zhengshen) Shu** · [@MtsYama](https://github.com/MtsYama) · [LinkedIn](https://www.linkedin.com/in/zhengshen-shu/)
- **Sikai Han** · [@Yuk1Neek0](https://github.com/Yuk1Neek0) · [LinkedIn](https://www.linkedin.com/in/sikai-han-6b7266348/)
- **Laxman KC** · [@laxkc](https://github.com/laxkc) · [LinkedIn](https://www.linkedin.com/in/laxmankc/)

---

## Figma file (public · the live design)

**https://www.figma.com/design/ZFcKmupLdbMMGqn5Twh10v/Maple-Ledger-%C2%B7-UI-Design?node-id=143-2**

File name: **Maple Ledger · UI Design**.

- The link opens on **node 143-2**, the richer Auditor concept page (matches
  `screenshots/console-auditor-fancy.png`).
- The other pages hold the **design tokens** (collection "Maple Ledger · Tokens", Light mode) and the
  three **workspaces** (Supplier, Purchaser, Auditor).
- Tokens are authored as **native Figma variables**, so you can pull colour and type straight from the
  file, or use `design-tokens.md` here. They are the same values.

---

## What is in this folder

| file | what it is |
|---|---|
| `README.md` | this overview + the Figma link + how to build from here |
| `design-tokens.md` | the full token set: colour, type, spacing, shape, icons, verdict logic |
| `ui-spec.md` | the per-screen spec: app shell + the three workspaces, component states, behaviour |
| `screenshots/console-supplier.png` | Supplier console : issue a signed attestation |
| `screenshots/console-purchaser.png` | Purchaser console : scan and read the hard verdict |
| `screenshots/console-auditor.png` | Auditor console : oversight, current build |
| `screenshots/console-auditor-fancy.png` | Auditor console : the richer concept (Figma node 143-2) |

---

## The product in one paragraph

Maple Ledger turns each supplier contribution into a cryptographically signed attestation, hash-linked
across tiers into a tamper-evident chain. Anyone can independently recompute the Canadian-content
percentage and the legal designation. The verdict is deterministic: the same chain always yields the
same percentage and the same designation, with no model in the loop. The UI exposes this across three
workspaces.

### The three workspaces

- **Supplier** : issue a signed attestation. Declare output, inputs consumed, materials and labour
  cost, country, and step type, then sign and submit into the transparency log.
- **Purchaser** : scan a QR or paste a hash, then read a hard verdict : the **provenance** chain, the
  **Canadian-content %**, and the **legal designation**, with any imported nodes flagged.
- **Auditor** : oversight. Replay the chain, surface anomalies, and reconcile mass balance, while the
  verdict stays deterministic.

### Verdict thresholds (deterministic)

```
Canadian-content % = Σ(performed-in-Canada cost) ÷ Σ(total cost)
```

- **≥ 51% → "Made in Canada"** (and last substantial transformation in Canada)
- **≥ 98% → "Product of Canada"** (and last substantial transformation in Canada)
- below 51% → no designation

Statistical anomaly detection is advisory only and never changes the verdict.

---

## How to build the UI from this folder

1. **Open the Figma file** (link above) and skim all pages: tokens, the three workspaces, the Auditor
   concept on node 143-2.
2. **Read `design-tokens.md`.** Set up the colour and type variables first. Load Space Grotesk +
   JetBrains Mono (and Noto Sans SC for CJK) via Google Fonts. Wire **Lucide** for all icons.
3. **Read `ui-spec.md`.** Build the shared app shell once (sidebar + topbar + footer), then the three
   workspaces against it.
4. **Match the screenshots** in `screenshots/` for exact spacing and layout. The running `frontend/`
   in this repo is the live reference; inspect it for markup.
5. **Hold the house rules:** mono for every number and ID, red used only for imported nodes and
   anomalies, 1px hairline borders, subtle shadows, generous whitespace, no gradients, no neon, no
   dark mode.

Two Auditor features (visibility tiers with role-based locks, and part classification) are roadmap.
They are described in `ui-spec.md` §5A / §5B. Wire the UI states if time allows; otherwise treat them
as planned.

---

*Team TrueNorth · Maple Ledger · 2026 RedTeam DefTech hackathon (Ottawa, 2026-05-30). Design by Ashton
(Zhengshen) Shu.*
