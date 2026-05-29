import { useCallback, useState } from "react";
import { fetchVerification } from "./api.js";
import { USE_MOCK, BACKEND_URL } from "./config.js";
import { mockGraph } from "./mockData.js";
import QrScanner from "./components/QrScanner.jsx";
import VerdictCard from "./components/VerdictCard.jsx";
import ProvenanceGraph from "./components/ProvenanceGraph.jsx";

// Top-level flow:
//   scan / type a root hash -> fetch /verify (or mock) -> render verdict + graph.
//
// The provenance graph topology is NOT yet returned by /verify, so we render a
// mock graph object alongside the (mock or live) verification result. This is
// the single place to swap in real graph data at integration time.
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
      // Live mode: /verify now returns the real chain topology — render it.
      // Mock mode (no graph in the canned result) falls back to the demo graph.
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
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-2xl">🍁</span>
            <div>
              <h1 className="text-lg font-bold leading-tight text-slate-900">
                Maple Ledger
              </h1>
              <p className="text-xs text-slate-500">
                Verify where a product really comes from
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Manual
            </button>
            <ModeBadge />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {status === "idle" && (
          <div className="mx-auto max-w-md">
            <QrScanner onResult={onScan} />
          </div>
        )}

        {status === "loading" && (
          <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-red-500" />
            <p className="text-slate-600">Verifying provenance…</p>
            {rootHash && (
              <p className="mt-1 font-mono text-xs text-slate-400">{rootHash}</p>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="mx-auto max-w-md space-y-4">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
              <p className="font-semibold text-red-800">
                Verification failed
              </p>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="w-full rounded-xl bg-slate-800 px-4 py-2.5 font-semibold text-white hover:bg-slate-900"
            >
              Scan another product
            </button>
          </div>
        )}

        {status === "done" && result && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <VerdictCard result={result} rootHash={rootHash} />
              {graph && <ProvenanceGraph graph={graph} />}
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setShowDetail(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-900"
              >
                View calculation details
              </button>
            </div>
            {graph && <CriticalityPanel graph={graph} />}
            {!USE_MOCK && <AskPanel rootHash={rootHash} />}
            <div className="text-center">
              <button
                type="button"
                onClick={reset}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Scan another product
              </button>
            </div>
            {showDetail && (
              <CostDetailModal
                result={result}
                graph={graph}
                onClose={() => setShowDetail(false)}
              />
            )}
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-slate-400">
        Cryptographic-provenance verifier · demo build
      </footer>

      {showManual && <Manual onClose={() => setShowManual(false)} />}
    </div>
  );
}

// ── User manual (VS Code-style: section sidebar + content pane) ─────────────
// Documents the CURRENT mock data format / behaviour. Updated on event day when
// the real spec drops (the data format is isolated behind the backend adapters).
const MANUAL_SECTIONS = [
  {
    id: "overview",
    title: "Overview",
    body: (
      <>
        <p>
          <b>Maple Ledger</b> verifies where a product really comes from. Every supplier
          contribution is a cryptographically signed <b>attestation</b>; each one references
          the attestations it consumed, forming a chain of custody from raw material to
          finished product.
        </p>
        <p>
          When a buyer scans a product, the system walks that chain, checks every signature
          against a registry of accredited suppliers, sums the production cost by country,
          and returns one of three designations — plus any integrity issues.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Product of Canada</b> — ≥ 98% Canadian cost + last transformation in Canada.</li>
          <li><b>Made in Canada</b> — ≥ 51% Canadian cost + last transformation in Canada.</li>
          <li><b>None</b> — neither condition met.</li>
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
          <li>Scan a QR code or paste the product&apos;s <b>root hash</b>.</li>
          <li>The backend collects every attestation reachable from that root and builds the provenance graph, guarding against cycles.</li>
          <li>Each node is checked in fixed precedence: schema → signature → known issuer → replay → broken link.</li>
          <li><b>Mass-balance:</b> a node may not consume more of an input than was produced upstream.</li>
          <li><b>Cost attribution:</b> each node&apos;s cost (materials + labour) is summed by country, in integer cents.</li>
          <li><b>Verdict:</b> the 98% / 51% thresholds are applied <i>and</i> the last substantial transformation must be in Canada.</li>
          <li><b>Advisory scoring</b> (anomaly + criticality) runs alongside but never changes the verdict.</li>
        </ol>
        <p className="text-slate-500">
          A failed node is excluded from the cost sum rather than crashing the run, so the
          system still returns a useful answer on imperfect data.
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
          Per the Competition Bureau of Canada. Both a cost threshold <b>and</b> the last
          substantial transformation in Canada are required.
        </p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1.5 pr-3">Designation</th>
              <th className="pr-3">Canadian cost</th>
              <th>Last transformation</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-1.5 pr-3 font-medium">Product of Canada</td>
              <td className="pr-3">≥ 98%</td>
              <td>in Canada</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-1.5 pr-3 font-medium">Made in Canada</td>
              <td className="pr-3">≥ 51%</td>
              <td>in Canada</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-3 font-medium">None</td>
              <td className="pr-3">&lt; 51%</td>
              <td>or not in Canada</td>
            </tr>
          </tbody>
        </table>
        <p className="text-slate-500">
          Comparisons use integer cross-multiplication (never divide-then-compare), so the
          result is exact and reproducible.
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
          Money is handled as <b>integer cents</b> end-to-end. For each valid node, its own
          cost (materials + labour) is attributed to its country of work; the Canadian
          percentage is Canadian cents over total cents.
        </p>
        <p>
          <b>Value-add</b> = labour ÷ (materials + labour) — the share of a node&apos;s own
          cost that is transformation rather than bought-in material.
        </p>
        <p>
          The <b>View calculation details</b> button on a result opens a breakdown: a
          cost-by-country pie and a per-component contribution bar chart, so you can see
          exactly how the percentage was reached. Nodes that failed an integrity check
          contribute $0 and are marked excluded.
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
        <p className="font-mono text-xs text-slate-500">
          MALFORMED → SIGNATURE_INVALID → UNKNOWN_ISSUER → REPLAY_DETECTED → BROKEN_LINK /
          CYCLE → MASS_BALANCE
        </p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
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
              <tr key={r} className="border-b border-slate-100 align-top">
                <td className="py-1.5 pr-3 font-mono text-xs">{r}</td>
                <td className="pr-3">{m}</td>
                <td className="text-slate-500">{e}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-slate-500">
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
          An attestation is the signed unit of provenance. <b>Note:</b> this is the current
          mock contract — the event-day specification replaces the exact field names/format,
          which is isolated behind the backend&apos;s adapter layer.
        </p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
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
              <tr key={f} className="border-b border-slate-100 align-top">
                <td className="py-1.5 pr-3 font-mono text-xs">{f}</td>
                <td className="pr-3 text-slate-500">{t}</td>
                <td className="text-slate-500">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{`{
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
          Each supplier holds an <b>Ed25519 key pair</b>. The <b>private key</b> (kept secret)
          signs attestations; the <b>public key</b> is registered once, with an accreditation
          authority, into the supplier registry.
        </p>
        <p>
          The purchaser never needs to know who a supplier is to trust the result: the backend
          looks up each <code>supplier_id</code> in the read-only registry to get the trusted
          public key and verifies the signature. A QR code carries only the <b>root hash</b> —
          a pointer, never a key.
        </p>
        <p>
          An attestation signed by a key the registry does not trust for that supplier is
          rejected (UNKNOWN_ISSUER / SIGNATURE_INVALID).
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
          The provenance graph is the verified supply chain. Each node is a supplier
          contribution; arrows point from an input to the consumer that used it.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><span className="font-medium text-emerald-600">Green</span> — Canadian, integrity OK.</li>
          <li><span className="font-medium text-slate-500">Grey</span> — foreign, integrity OK.</li>
          <li><span className="font-medium text-red-600">Red</span> — failed an integrity check (excluded from the cost sum).</li>
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
          An <b>advisory</b> lens, separate from the legal verdict — it never changes the
          designation. It answers &quot;is cost % the only meaningful metric?&quot; by showing
          where the transformation / IP sits.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>critical</b> — a substantial transformation or high value-add (key IP).</li>
          <li><b>standard</b> — moderate transformation.</li>
          <li><b>commodity</b> — a raw-material input with little value-add.</li>
        </ul>
        <p>
          A <b>critical</b> component made outside Canada is flagged <b>⚠ offshore</b> — a
          strategic dependency worth watching.
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
          <dt className="font-medium text-slate-800">Attestation</dt>
          <dd className="text-slate-600">A signed record of one supplier&apos;s contribution.</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-800">Root hash</dt>
          <dd className="text-slate-600">SHA-256 content address of the finished product&apos;s attestation; what a QR encodes.</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-800">Substantial transformation</dt>
          <dd className="text-slate-600">A step that changes the form/nature of inputs (e.g. aluminum → motor housing).</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-800">Value-add</dt>
          <dd className="text-slate-600">Labour share of a node&apos;s own cost.</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-800">Registry</dt>
          <dd className="text-slate-600">Read-only list of accredited suppliers&apos; public keys.</dd>
        </div>
      </dl>
    ),
  },
];

function Manual({ onClose }) {
  const [active, setActive] = useState(MANUAL_SECTIONS[0].id);
  const section = MANUAL_SECTIONS.find((s) => s.id === active) || MANUAL_SECTIONS[0];
  return (
    <div
      className="fixed inset-0 z-50 flex bg-slate-900/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-3">
          <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Manual
          </div>
          <nav className="space-y-0.5">
            {MANUAL_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(s.id)}
                className={
                  "block w-full rounded-md px-3 py-1.5 text-left text-sm " +
                  (active === s.id
                    ? "bg-red-600 font-medium text-white"
                    : "text-slate-700 hover:bg-slate-200")
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
            className="absolute right-4 top-4 rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
          <h2 className="text-xl font-bold text-slate-900">{section.title}</h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
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

  // Cost-by-country pie via CSS conic-gradient (CA = green, others cycle a palette).
  const palette = ["#94a3b8", "#f59e0b", "#6366f1", "#dc2626", "#0ea5e9"];
  let acc = 0;
  let other = 0;
  const slices = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .map(([country, c]) => {
      const start = total ? (acc / total) * 360 : 0;
      acc += c;
      const end = total ? (acc / total) * 360 : 0;
      const color = country === "CA" ? "#16a34a" : palette[other++ % palette.length];
      return { country, c, start, end, color };
    });
  const gradient =
    slices.length > 0
      ? `conic-gradient(${slices.map((s) => `${s.color} ${s.start}deg ${s.end}deg`).join(",")})`
      : "#e2e8f0";

  const nodes = (graph?.nodes || [])
    .slice()
    .sort((a, b) => (b.contribution_cents || 0) - (a.contribution_cents || 0));
  const maxContrib = Math.max(1, ...nodes.map((n) => n.contribution_cents || 0));
  const haveContrib = nodes.some((n) => (n.contribution_cents || 0) > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              How the Canadian content was calculated
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Each component&apos;s cost contribution, attributed to where the work happened.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-center">
          <div className="text-3xl font-bold text-slate-900">
            {((result.canadian_pct || 0) * 100).toFixed(1)}%
          </div>
          <div className="mt-1 text-sm text-slate-600">
            {dollars(result.canadian_cost_cents)} Canadian of {dollars(total)} total
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Product of Canada ≥ 98% · Made in Canada ≥ 51% (last transformation in Canada)
          </div>
        </div>

        <div className="mt-5 flex items-center gap-5">
          <div
            className="h-32 w-32 shrink-0 rounded-full ring-1 ring-slate-200"
            style={{ background: gradient }}
            role="img"
            aria-label="Cost by country"
          />
          <ul className="space-y-1.5 text-sm">
            {slices.map((s) => (
              <li key={s.country} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: s.color }}
                />
                <span className="font-medium text-slate-700">{s.country}</span>
                <span className="text-slate-500">
                  {dollars(s.c)} · {pctOf(s.c)}%
                </span>
              </li>
            ))}
          </ul>
        </div>

        <h3 className="mt-6 mb-2 text-sm font-semibold text-slate-700">
          Per-component contribution
        </h3>
        {haveContrib ? (
          <ul className="space-y-2.5">
            {nodes.map((n) => {
              const c = n.contribution_cents || 0;
              const excluded = c === 0;
              const bar = excluded
                ? "bg-red-300"
                : n.country === "CA"
                ? "bg-emerald-500"
                : "bg-slate-400";
              return (
                <li key={n.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">
                      {n.product_id}{" "}
                      <span className="text-xs text-slate-400">
                        · {n.supplier_id} · {n.country}
                      </span>
                    </span>
                    <span className="text-slate-500">
                      {dollars(c)} · {pctOf(c)}%{excluded ? " · excluded" : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded bg-slate-100">
                    <div
                      className={"h-full " + bar}
                      style={{ width: `${Math.round((c / maxContrib) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">
            Per-component breakdown is available in live mode (append <code>?mock=0</code>).
          </p>
        )}

        <p className="mt-5 text-xs text-slate-400">
          Green = Canadian cost · grey = foreign · red = excluded (failed an integrity check, so it
          does not count toward the total). These are the verified amounts the verdict was computed
          from.
        </p>
      </div>
    </div>
  );
}

function CriticalityPanel({ graph }) {
  const nodes = (graph?.nodes || []).filter((n) => n.criticality);
  if (nodes.length === 0) return null;
  const order = ["critical", "standard", "commodity"];
  const style = {
    critical: "border-red-200 bg-red-50 text-red-800",
    standard: "border-slate-200 bg-slate-50 text-slate-700",
    commodity: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">Strategic criticality</h2>
      <p className="mt-1 text-sm text-slate-500">
        An advisory lens, separate from the legal verdict. Value-add = labour share of
        a component's own cost. A{" "}
        <span className="font-medium text-amber-700">critical</span> component made
        outside Canada is the strategic risk to watch.
      </p>
      <ul className="mt-3 space-y-2">
        {order.flatMap((cls) =>
          nodes
            .filter((n) => n.criticality.component_class === cls)
            .map((n) => (
              <li
                key={n.id}
                className={"flex items-center justify-between rounded-lg border px-3 py-2 text-sm " + style[cls]}
              >
                <span className="flex items-center gap-2">
                  <span>
                    {n.product_id}{" "}
                    <span className="text-xs opacity-70">
                      · {n.supplier_id} · {n.country}
                    </span>
                  </span>
                  {cls === "critical" && n.country !== "CA" && (
                    <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                      ⚠ offshore
                    </span>
                  )}
                </span>
                <span className="text-xs font-semibold uppercase">
                  {cls} · {Math.round((n.criticality.value_add_pct || 0) * 100)}% value-add
                </span>
              </li>
            ))
        )}
      </ul>
    </div>
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">Ask about this product</h2>
      <p className="mt-1 text-sm text-slate-500">
        Natural-language verifier — answers cite attestation ids; every number comes
        from the verified math, never the model.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="e.g. Which inputs come from outside Canada?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && q.trim() && ask()}
        />
        <button
          type="button"
          onClick={ask}
          disabled={busy || !q.trim()}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? "…" : "Ask"}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-amber-700">{err}</p>}
      {ans && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <p>{ans.answer}</p>
          {ans.citations?.length > 0 && (
            <p className="mt-2 text-xs text-slate-400">
              cites: {ans.citations.map((c) => c.slice(0, 10)).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ModeBadge() {
  if (USE_MOCK) {
    return (
      <span
        title="Showing hardcoded mock data. Append ?mock=0 to use the live backend."
        className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700"
      >
        MOCK DATA
      </span>
    );
  }
  return (
    <span
      title={`Calling the live verifier at ${BACKEND_URL}`}
      className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
    >
      LIVE · {BACKEND_URL.replace(/^https?:\/\//, "")}
    </span>
  );
}
