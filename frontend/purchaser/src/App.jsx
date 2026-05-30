import { useCallback, useState } from "react";
import { fetchVerification } from "./api.js";
import { USE_MOCK, BACKEND_URL } from "./config.js";
import { mockGraph } from "./mockData.js";
import QrScanner from "./components/QrScanner.jsx";
import VerdictCard from "./components/VerdictCard.jsx";
import ProvenanceGraph from "./components/ProvenanceGraph.jsx";
import Panel from "./components/ui/Panel.jsx";
import Readout, { StatusNode } from "./components/ui/Readout.jsx";
import BootSequence from "./components/ui/BootSequence.jsx";

// Shared control surface button styles.
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 border border-cyan bg-cyan/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-cyan transition hover:bg-cyan/20 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_GHOST =
  "inline-flex items-center justify-center gap-2 border border-line px-4 py-2 text-sm font-medium uppercase tracking-[0.14em] text-dim transition hover:border-line-bright hover:text-ink";

// Top-level flow:
//   scan / type a root hash -> fetch /verify (or mock) -> render verdict + graph.
//
// Live mode: /verify returns the real chain topology. Mock mode falls back to a
// canned graph object alongside the canned verification result.
export default function App() {
  const [rootHash, setRootHash] = useState(null);
  const [result, setResult] = useState(null);
  const [graph, setGraph] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [error, setError] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const onScan = useCallback(async (hash) => {
    setRootHash(hash);
    setStatus("loading");
    setError(null);
    setResult(null);
    setGraph(null);
    try {
      const res = await fetchVerification(hash);
      setResult(res);
      setGraph(res?.graph?.nodes?.length ? res.graph : mockGraph);
      setStatus("done");
    } catch (err) {
      setError(err.message || String(err));
      setStatus("error");
    }
  }, []);

  const reset = useCallback(() => {
    setRootHash(null);
    setResult(null);
    setGraph(null);
    setStatus("idle");
    setError(null);
    setShowDetail(false);
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      {/* identity stripe */}
      <div className="h-0.5 w-full bg-gradient-to-r from-maple via-maple/40 to-transparent" />

      <header className="sticky top-0 z-40 border-b border-line bg-panel/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <img src="/maple.svg" alt="" aria-hidden className="h-6 w-6" />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-[0.22em] text-ink">
                MAPLE LEDGER
              </div>
              <div className="text-[10px] uppercase tracking-[0.26em] text-dim">
                provenance verification terminal
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setShowManual(true)} className={BTN_GHOST}>
              manual
            </button>
            <ModeBadge />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {status === "idle" && (
          <div className="mx-auto max-w-md space-y-4">
            <div className="flex items-center justify-between border border-line bg-panel px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-dim">
              <StatusNode tone="signal" label="system ready" blink />
              <span className="text-faint">awaiting scan</span>
            </div>
            <QrScanner onResult={onScan} />
          </div>
        )}

        {status === "loading" && (
          <div className="mx-auto max-w-xl">
            <BootSequence rootHash={rootHash} />
          </div>
        )}

        {status === "error" && (
          <div className="mx-auto max-w-md space-y-4">
            <Panel label="fault" accent="alarm" right="halted">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-alarm">
                <span className="blink">●</span> verification fault
              </div>
              <p className="prose-sans mt-2 text-sm text-dim">{error}</p>
            </Panel>
            <button type="button" onClick={reset} className={`${BTN_PRIMARY} w-full`}>
              ▸ scan another product
            </button>
          </div>
        )}

        {status === "done" && result && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <VerdictCard result={result} rootHash={rootHash} />
              {graph && <ProvenanceGraph graph={graph} />}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={() => setShowDetail(true)} className={BTN_PRIMARY}>
                ▸ calculation detail
              </button>
              <button type="button" onClick={reset} className={BTN_GHOST}>
                ↻ scan another
              </button>
            </div>

            {graph && <CriticalityPanel graph={graph} />}
            {!USE_MOCK && <AskPanel rootHash={rootHash} />}

            {showDetail && (
              <CostDetailModal result={result} graph={graph} onClose={() => setShowDetail(false)} />
            )}
          </div>
        )}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 py-6 text-center text-[11px] uppercase tracking-[0.18em] text-faint">
        cryptographic-provenance verifier · demo build
      </footer>

      {showManual && <Manual onClose={() => setShowManual(false)} />}
    </div>
  );
}

function ModeBadge() {
  if (USE_MOCK) {
    return (
      <span
        title="Showing hardcoded mock data. Append ?mock=0 to use the live backend."
        className="border border-amber/40 bg-amber/10 px-2.5 py-1"
      >
        <StatusNode tone="amber" label="mock feed" blink />
      </span>
    );
  }
  return (
    <span
      title={`Calling the live verifier at ${BACKEND_URL}`}
      className="border border-signal/40 bg-signal/10 px-2.5 py-1"
    >
      <StatusNode tone="signal" label={`live · ${BACKEND_URL.replace(/^https?:\/\//, "")}`} blink />
    </span>
  );
}

// ── User manual (control-room field guide: section index + content pane) ────
// Documents the CURRENT mock data format / behaviour. Updated on event day when
// the real spec drops (the data format is isolated behind the backend adapters).
const MANUAL_SECTIONS = [
  {
    id: "overview",
    title: "Overview",
    body: (
      <>
        <p>
          <b className="text-ink">Maple Ledger</b> verifies where a product really comes from.
          Every supplier contribution is a cryptographically signed <b className="text-ink">attestation</b>;
          each one references the attestations it consumed, forming a chain of custody from raw
          material to finished product.
        </p>
        <p>
          When a buyer scans a product, the system walks that chain, checks every signature against
          a registry of accredited suppliers, sums the production cost by country, and returns one
          of three designations — plus any integrity issues.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b className="text-signal">Product of Canada</b> — ≥ 98% Canadian cost + last transformation in Canada.</li>
          <li><b className="text-signal">Made in Canada</b> — ≥ 51% Canadian cost + last transformation in Canada.</li>
          <li><b className="text-alarm">None</b> — neither condition met.</li>
        </ul>
      </>
    ),
  },
  {
    id: "process",
    title: "How verification works",
    body: (
      <>
        <p>A verification runs as a fixed, reproducible pipeline:</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Scan a QR code or paste the product&apos;s <b className="text-ink">root hash</b>.</li>
          <li>The backend collects every attestation reachable from that root and builds the provenance graph, guarding against cycles.</li>
          <li>Each node is checked in fixed precedence: schema → signature → known issuer → replay → broken link.</li>
          <li><b className="text-ink">Mass-balance:</b> a node may not consume more of an input than was produced upstream.</li>
          <li><b className="text-ink">Cost attribution:</b> each node&apos;s cost (materials + labour) is summed by country, in integer cents.</li>
          <li><b className="text-ink">Verdict:</b> the 98% / 51% thresholds are applied <i>and</i> the last substantial transformation must be in Canada.</li>
          <li><b className="text-ink">Advisory scoring</b> (anomaly + criticality) runs alongside but never changes the verdict.</li>
        </ol>
        <p className="text-faint">
          A failed node is excluded from the cost sum rather than crashing the run, so the system
          still returns a useful answer on imperfect data.
        </p>
      </>
    ),
  },
  {
    id: "designations",
    title: "Designations & thresholds",
    body: (
      <>
        <p>
          Per the Competition Bureau of Canada. Both a cost threshold <b className="text-ink">and</b> the
          last substantial transformation in Canada are required.
        </p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-faint">
              <th className="py-1.5 pr-3">Designation</th>
              <th className="pr-3">Canadian cost</th>
              <th>Last transformation</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="py-1.5 pr-3 font-medium text-signal">Product of Canada</td>
              <td className="pr-3">≥ 98%</td>
              <td>in Canada</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-1.5 pr-3 font-medium text-signal">Made in Canada</td>
              <td className="pr-3">≥ 51%</td>
              <td>in Canada</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-3 font-medium text-alarm">None</td>
              <td className="pr-3">&lt; 51%</td>
              <td>or not in Canada</td>
            </tr>
          </tbody>
        </table>
        <p className="text-faint">
          Comparisons use integer cross-multiplication (never divide-then-compare), so the result is
          exact and reproducible.
        </p>
      </>
    ),
  },
  {
    id: "calculation",
    title: "Cost calculation",
    body: (
      <>
        <p>
          Money is handled as <b className="text-ink">integer cents</b> end-to-end. For each valid
          node, its own cost (materials + labour) is attributed to its country of work; the Canadian
          percentage is Canadian cents over total cents.
        </p>
        <p>
          <b className="text-ink">Value-add</b> = labour ÷ (materials + labour) — the share of a
          node&apos;s own cost that is transformation rather than bought-in material.
        </p>
        <p>
          The <b className="text-cyan">calculation detail</b> button on a result opens a breakdown:
          a cost-by-country share and a per-component contribution chart, so you can see exactly how
          the percentage was reached. Nodes that failed an integrity check contribute $0 and are
          marked excluded.
        </p>
      </>
    ),
  },
  {
    id: "integrity",
    title: "Integrity & reason codes",
    body: (
      <>
        <p>Checks are applied per node in a fixed precedence; the first match wins:</p>
        <p className="font-mono text-xs text-signal/80">
          MALFORMED → SIGNATURE_INVALID → UNKNOWN_ISSUER → REPLAY_DETECTED → BROKEN_LINK / CYCLE →
          MASS_BALANCE
        </p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-faint">
              <th className="py-1.5 pr-3">Reason</th>
              <th className="pr-3">Meaning</th>
              <th>Effect</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["MALFORMED", "fails schema validation", "rejected"],
              ["SIGNATURE_INVALID", "signature does not verify", "node excluded"],
              ["UNKNOWN_ISSUER", "signer not a verified registry key", "node excluded"],
              ["REPLAY_DETECTED", "reused (issuer, output) serial", "node excluded"],
              ["BROKEN_LINK", "missing / duplicate input reference", "node excluded"],
              ["CYCLE", "references form a loop", "whole chain → None"],
              ["MASS_BALANCE", "consumed > produced upstream", "hard reject → None"],
              ["TEMPORAL_INVERSION", "input dated after its consumer", "advisory flag"],
              ["ANOMALY", "implausible cost shape (ML)", "advisory flag"],
            ].map(([r, m, e]) => (
              <tr key={r} className="border-b border-line align-top">
                <td className="py-1.5 pr-3 font-mono text-xs text-cyan">{r}</td>
                <td className="pr-3">{m}</td>
                <td className="text-faint">{e}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-faint">
          Advisory flags queue a record for human review but never change the designation.
        </p>
      </>
    ),
  },
  {
    id: "data-format",
    title: "Attestation data format",
    body: (
      <>
        <p>
          An attestation is the signed unit of provenance. <b className="text-ink">Note:</b> this is
          the current mock contract — the event-day specification replaces the exact field
          names/format, which is isolated behind the backend&apos;s adapter layer.
        </p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-faint">
              <th className="py-1.5 pr-3">Field</th>
              <th className="pr-3">Type</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["supplier_id", "string", "maps to a registry key"],
              ["output.product_id / quantity / unit", "string / int / string", "what this node produced"],
              ["inputs[]", "{ attestation_hash, quantity_used }", "what it consumed"],
              ["materials_cents", "int", "integer cents, ≥ 0"],
              ["labour_cents", "int", "integer cents, ≥ 0"],
              ["work_country", "string", "ISO-2, e.g. CA / CN"],
              ["is_substantial_transformation", "bool", "spec-dependent flag"],
              ["timestamp", "string", "ISO-8601, ordering only"],
              ["signature", "string", "base64 Ed25519 over the payload"],
            ].map(([f, t, n]) => (
              <tr key={f} className="border-b border-line align-top">
                <td className="py-1.5 pr-3 font-mono text-xs text-cyan">{f}</td>
                <td className="pr-3 text-dim">{t}</td>
                <td className="text-faint">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <pre className="overflow-x-auto border border-line bg-base p-3 text-xs text-signal/90">{`{
  "supplier_id": "SUP-DRONE",
  "output": { "product_id": "drone_X1", "quantity": 1, "unit": "pcs" },
  "inputs": [{ "attestation_hash": "…", "quantity_used": 1 }],
  "materials_cents": 20,
  "labour_cents": 400,
  "work_country": "CA",
  "is_substantial_transformation": true,
  "timestamp": "2026-05-03T08:00:00Z",
  "signature": "<base64 Ed25519>"
}`}</pre>
      </>
    ),
  },
  {
    id: "trust",
    title: "Keys & trust model",
    body: (
      <>
        <p>
          Each supplier holds an <b className="text-ink">Ed25519 key pair</b>. The
          <b className="text-ink"> private key</b> (kept secret) signs attestations; the
          <b className="text-ink"> public key</b> is registered once, with an accreditation
          authority, into the supplier registry.
        </p>
        <p>
          The purchaser never needs to know who a supplier is to trust the result: the backend looks
          up each <code className="text-cyan">supplier_id</code> in the read-only registry to get the
          trusted public key and verifies the signature. A QR code carries only the
          <b className="text-ink"> root hash</b> — a pointer, never a key.
        </p>
        <p>
          An attestation signed by a key the registry does not trust for that supplier is rejected
          (UNKNOWN_ISSUER / SIGNATURE_INVALID).
        </p>
      </>
    ),
  },
  {
    id: "graph",
    title: "Provenance graph",
    body: (
      <>
        <p>
          The provenance graph is the verified supply chain. Each node is a supplier contribution;
          arrows point from an input to the consumer that used it.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><span className="font-medium text-signal">Green</span> — Canadian, integrity OK.</li>
          <li><span className="font-medium text-dim">Grey</span> — foreign, integrity OK.</li>
          <li><span className="font-medium text-alarm">Red</span> — failed an integrity check (excluded from the cost sum).</li>
        </ul>
      </>
    ),
  },
  {
    id: "criticality",
    title: "Strategic criticality",
    body: (
      <>
        <p>
          An <b className="text-ink">advisory</b> lens, separate from the legal verdict — it never
          changes the designation. It answers &quot;is cost % the only meaningful metric?&quot; by
          showing where the transformation / IP sits.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b className="text-alarm">critical</b> — a substantial transformation or high value-add (key IP).</li>
          <li><b className="text-ink">standard</b> — moderate transformation.</li>
          <li><b className="text-signal">commodity</b> — a raw-material input with little value-add.</li>
        </ul>
        <p>
          A <b className="text-amber">critical</b> component made outside Canada is flagged
          <b className="text-amber"> ⚠ offshore</b> — a strategic dependency worth watching.
        </p>
      </>
    ),
  },
  {
    id: "glossary",
    title: "Glossary",
    body: (
      <dl className="space-y-2">
        <div>
          <dt className="font-medium text-ink">Attestation</dt>
          <dd className="text-dim">A signed record of one supplier&apos;s contribution.</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Root hash</dt>
          <dd className="text-dim">SHA-256 content address of the finished product&apos;s attestation; what a QR encodes.</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Substantial transformation</dt>
          <dd className="text-dim">A step that changes the form/nature of inputs (e.g. aluminum → motor housing).</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Value-add</dt>
          <dd className="text-dim">Labour share of a node&apos;s own cost.</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Registry</dt>
          <dd className="text-dim">Read-only list of accredited suppliers&apos; public keys.</dd>
        </div>
      </dl>
    ),
  },
];

function Manual({ onClose }) {
  const [active, setActive] = useState(MANUAL_SECTIONS[0].id);
  const section = MANUAL_SECTIONS.find((s) => s.id === active) || MANUAL_SECTIONS[0];
  return (
    <div className="fixed inset-0 z-50 flex bg-base/80 p-4 backdrop-blur sm:p-8" onClick={onClose}>
      <div
        className="mx-auto flex h-full max-h-[88vh] w-full max-w-4xl overflow-hidden border border-line-bright bg-panel shadow-[0_0_60px_-20px_var(--color-cyan)]"
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-line bg-elevated p-3">
          <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan">
            Field guide
          </div>
          <nav className="space-y-0.5">
            {MANUAL_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(s.id)}
                className={
                  "block w-full px-3 py-1.5 text-left text-sm transition " +
                  (active === s.id
                    ? "border-l-2 border-cyan bg-cyan/10 font-medium text-cyan"
                    : "border-l-2 border-transparent text-dim hover:bg-line/40 hover:text-ink")
                }
              >
                {s.title}
              </button>
            ))}
          </nav>
        </aside>

        <div className="relative flex-1 overflow-y-auto p-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 border border-line px-2 py-0.5 text-dim transition hover:border-alarm hover:text-alarm"
          >
            ✕
          </button>
          <h2 className="text-lg font-semibold uppercase tracking-[0.12em] text-ink">
            {section.title}
          </h2>
          <div className="prose-sans mt-3 space-y-3 text-sm leading-relaxed text-dim">
            {section.body}
          </div>
        </div>
      </div>
    </div>
  );
}

function CostDetailModal({ result, graph, onClose }) {
  const total = result.total_cost_cents || 0;
  const byCountry = result.cost_by_country || {};
  const dollars = (c) => `$${((c || 0) / 100).toFixed(2)}`;
  const pctOf = (c) => (total ? Math.round(((c || 0) / total) * 1000) / 10 : 0);

  // Cost-by-country share via conic-gradient (CA = signal green, others cycle).
  const palette = ["#46d6f0", "#f5b13d", "#9a6cf0", "#7e8e9a", "#f0414f"];
  let acc = 0;
  let other = 0;
  const slices = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .map(([country, c]) => {
      const start = total ? (acc / total) * 360 : 0;
      acc += c;
      const end = total ? (acc / total) * 360 : 0;
      const color = country === "CA" ? "#34e8a0" : palette[other++ % palette.length];
      return { country, c, start, end, color };
    });
  const gradient =
    slices.length > 0
      ? `conic-gradient(${slices.map((s) => `${s.color} ${s.start}deg ${s.end}deg`).join(",")})`
      : "var(--color-line)";

  const nodes = (graph?.nodes || [])
    .slice()
    .sort((a, b) => (b.contribution_cents || 0) - (a.contribution_cents || 0));
  const maxContrib = Math.max(1, ...nodes.map((n) => n.contribution_cents || 0));
  const haveContrib = nodes.some((n) => (n.contribution_cents || 0) > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 p-4 backdrop-blur" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto border border-line-bright bg-panel shadow-[0_0_60px_-20px_var(--color-cyan)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-cyan">
            calculation detail
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="border border-line px-2 py-0.5 text-dim transition hover:border-alarm hover:text-alarm"
          >
            ✕
          </button>
        </header>

        <div className="p-5">
          <p className="prose-sans text-sm text-dim">
            Each component&apos;s cost contribution, attributed to where the work happened.
          </p>

          <div className="mt-4 border border-line bg-base p-4 text-center">
            <div className="text-3xl font-semibold tabular-nums text-signal glow-signal">
              {((result.canadian_pct || 0) * 100).toFixed(1)}%
            </div>
            <div className="mt-1 text-sm text-dim">
              {dollars(result.canadian_cost_cents)} Canadian of {dollars(total)} total
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-faint">
              Product of Canada ≥ 98% · Made in Canada ≥ 51% (last transformation in Canada)
            </div>
          </div>

          <div className="mt-5 flex items-center gap-5">
            <div
              className="h-32 w-32 shrink-0 rounded-full ring-1 ring-line"
              style={{ background: gradient }}
              role="img"
              aria-label="Cost by country"
            />
            <ul className="space-y-1.5 text-sm">
              {slices.map((s) => (
                <li key={s.country} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3" style={{ backgroundColor: s.color }} />
                  <span className="font-medium text-ink">{s.country}</span>
                  <span className="text-dim">
                    {dollars(s.c)} · {pctOf(s.c)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <h3 className="mt-6 mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cyan">
            Per-component contribution
          </h3>
          {haveContrib ? (
            <ul className="space-y-2.5">
              {nodes.map((n) => {
                const c = n.contribution_cents || 0;
                const excluded = c === 0;
                const barColor = excluded
                  ? "var(--color-alarm)"
                  : n.country === "CA"
                  ? "var(--color-signal)"
                  : "var(--color-dim)";
                return (
                  <li key={n.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink">
                        {n.product_id}{" "}
                        <span className="text-xs text-faint">· {n.supplier_id} · {n.country}</span>
                      </span>
                      <span className="text-dim">
                        {dollars(c)} · {pctOf(c)}%{excluded ? " · excluded" : ""}
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden border border-line bg-base">
                      <div
                        className="h-full"
                        style={{ width: `${Math.round((c / maxContrib) * 100)}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-faint">
              Per-component breakdown is available in live mode (append <code className="text-cyan">?mock=0</code>).
            </p>
          )}

          <p className="prose-sans mt-5 text-xs text-faint">
            Green = Canadian cost · grey = foreign · red = excluded (failed an integrity check, so it
            does not count toward the total). These are the verified amounts the verdict was computed
            from.
          </p>
        </div>
      </div>
    </div>
  );
}

function CriticalityPanel({ graph }) {
  const nodes = (graph?.nodes || []).filter((n) => n.criticality);
  if (nodes.length === 0) return null;
  const order = ["critical", "standard", "commodity"];
  const tone = {
    critical: "border-alarm/40 bg-alarm/10 text-alarm",
    standard: "border-line bg-elevated text-ink",
    commodity: "border-signal/40 bg-signal/10 text-signal",
  };
  return (
    <Panel label="strategic criticality" accent="cyan" right="advisory">
      <p className="prose-sans text-sm text-dim">
        An advisory lens, separate from the legal verdict. Value-add = labour share of a
        component&apos;s own cost. A <span className="font-medium text-amber">critical</span>{" "}
        component made outside Canada is the strategic risk to watch.
      </p>
      <ul className="mt-3 space-y-2">
        {order.flatMap((cls) =>
          nodes
            .filter((n) => n.criticality.component_class === cls)
            .map((n) => (
              <li
                key={n.id}
                className={"flex items-center justify-between border px-3 py-2 text-sm " + tone[cls]}
              >
                <span className="flex items-center gap-2">
                  <span>
                    {n.product_id}{" "}
                    <span className="text-xs opacity-70">· {n.supplier_id} · {n.country}</span>
                  </span>
                  {cls === "critical" && n.country !== "CA" && (
                    <span className="bg-amber/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber">
                      ⚠ offshore
                    </span>
                  )}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">
                  {cls} · {Math.round((n.criticality.value_add_pct || 0) * 100)}% value-add
                </span>
              </li>
            ))
        )}
      </ul>
    </Panel>
  );
}

function AskPanel({ rootHash }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState(null);
  const [err, setErr] = useState("");

  async function ask() {
    setBusy(true);
    setErr("");
    setAns(null);
    try {
      const res = await fetch(`${BACKEND_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, root_hash: rootHash }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.detail || `Verifier unavailable (HTTP ${res.status}).`);
        return;
      }
      setAns(data);
    } catch (e) {
      setErr(`Could not reach backend: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel label="query ledger" accent="cyan" right="natural language">
      <p className="prose-sans text-sm text-dim">
        Natural-language verifier — answers cite attestation ids; every number comes from the
        verified math, never the model.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          className="min-w-0 flex-1 border border-line bg-base px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-cyan focus:outline-none"
          placeholder="e.g. Which inputs come from outside Canada?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && q.trim() && ask()}
        />
        <button
          type="button"
          onClick={ask}
          disabled={busy || !q.trim()}
          className="border border-cyan bg-cyan/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-cyan transition hover:bg-cyan/20 disabled:opacity-50"
        >
          {busy ? "…" : "ask"}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-amber">{err}</p>}
      {ans && (
        <div className="prose-sans mt-3 border border-line bg-base p-3 text-sm text-ink">
          <p>{ans.answer}</p>
          {ans.citations?.length > 0 && (
            <p className="mt-2 font-mono text-xs text-faint">
              cites: {ans.citations.map((c) => c.slice(0, 10)).join(", ")}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
