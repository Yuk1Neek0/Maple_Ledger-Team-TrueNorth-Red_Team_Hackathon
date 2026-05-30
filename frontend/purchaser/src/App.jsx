import { useCallback, useMemo, useRef, useState } from "react";
import { verifyChain } from "./api.js";
import { BACKEND_URL } from "./config.js";
import {
  buildGraph,
  costAttribution,
  criticality,
  parseChainInput,
  workedExampleChain,
  tamperedExampleChain,
} from "./chain.js";
import VerdictCard from "./components/VerdictCard.jsx";
import ProvenanceGraph from "./components/ProvenanceGraph.jsx";
import QrScanner from "./components/QrScanner.jsx";
import Panel from "./components/ui/Panel.jsx";
import { StatusNode } from "./components/ui/Readout.jsx";
import BootSequence from "./components/ui/BootSequence.jsx";
import Shell from "./components/ui/Shell.jsx";
import { countryName, formatCad, formatPct } from "./labels.js";

// Shared control surface button styles (Maple Ledger light).
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-btn bg-navy px-4 py-2 text-sm font-medium text-paper transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_GHOST =
  "inline-flex items-center justify-center gap-2 rounded-btn border border-line-2 bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:bg-paper-2";

// Top-level flow:
//   load a CHAIN (worked example, scanned QR, or pasted JSON) -> POST /verify ->
//   render the real verdict + the provenance graph built from the chain.
//
// The real /verify response carries only designation / percentage / chain_valid
// / anomalies. Topology and cost-by-country are derived locally from the chain
// we submitted (the request); the legal verdict comes from the backend.
export default function App() {
  const [chain, setChain] = useState(null); // the submitted { product_attestation_id, attestations }
  const [result, setResult] = useState(null); // the real /verify response
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [error, setError] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showManual, setShowManual] = useState(false);

  // Derived view models — recomputed only when the verified chain/result change.
  const graph = useMemo(
    () =>
      chain && result
        ? buildGraph(chain.attestations, result.anomalies, chain.product_attestation_id)
        : null,
    [chain, result]
  );
  const cost = useMemo(
    () => (chain ? costAttribution(chain.attestations) : null),
    [chain]
  );
  const crit = useMemo(() => (chain ? criticality(chain.attestations) : null), [chain]);

  const runVerify = useCallback(async (loaded) => {
    setChain(loaded);
    setResult(null);
    setError(null);
    setStatus("loading");
    try {
      const res = await verifyChain(loaded);
      setResult(res);
      setStatus("done");
    } catch (err) {
      setError(err.message || String(err));
      setStatus("error");
    }
  }, []);

  const reset = useCallback(() => {
    setChain(null);
    setResult(null);
    setStatus("idle");
    setError(null);
    setShowDetail(false);
  }, []);

  return (
    <Shell
      active="purchaser"
      context="purchaser · verify origin"
      backend={BACKEND_URL.replace(/^https?:\/\//, "")}
    >
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="mb-5 flex items-center justify-between">
          <button type="button" onClick={() => setShowManual(true)} className={BTN_GHOST}>
            field guide
          </button>
          <StatusNode
            tone={status === "error" ? "red" : "ok"}
            label={`live · ${BACKEND_URL.replace(/^https?:\/\//, "")}`}
          />
        </div>

        {status === "idle" && <VerifyHero onVerify={runVerify} />}

        {status === "loading" && (
          <div className="mx-auto max-w-xl">
            <BootSequence rootHash={chain?.product_attestation_id} />
          </div>
        )}

        {status === "error" && (
          <div className="mx-auto max-w-md space-y-4">
            <Panel label="fault" accent="red" right="halted">
              <div className="flex items-center gap-2 text-sm font-semibold text-red">
                <span className="inline-block h-2 w-2 rounded-full bg-red" aria-hidden /> verification fault
              </div>
              <p className="mt-2 text-sm text-ink-2">{error}</p>
            </Panel>
            <button type="button" onClick={reset} className={`${BTN_PRIMARY} w-full`}>
              ▸ verify another product
            </button>
          </div>
        )}

        {status === "done" && result && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <VerdictCard
                result={result}
                cost={cost}
                productId={chain?.product_attestation_id}
              />
              {graph && <ProvenanceGraph graph={graph} />}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={() => setShowDetail(true)} className={BTN_PRIMARY}>
                ▸ calculation detail
              </button>
              <button type="button" onClick={reset} className={BTN_GHOST}>
                ↻ verify another product
              </button>
            </div>

            {crit && <CriticalityPanel nodes={crit} />}

            {showDetail && (
              <CostDetailModal
                result={result}
                cost={cost}
                onClose={() => setShowDetail(false)}
              />
            )}
          </div>
        )}
      </main>

      {showManual && <Manual onClose={() => setShowManual(false)} />}
    </Shell>
  );
}

// VerifyHero: the buyer's entry point — scan a QR or paste a hash / chain JSON,
// or load the worked example. The real backend verifies a whole chain in one
// POST, so a scanned/pasted value is parsed into a chain before submitting.
function VerifyHero({ onVerify }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  function tryVerify(raw) {
    setErr("");
    try {
      onVerify(parseChainInput(raw));
    } catch (e) {
      setErr(e.message);
    }
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result || ""));
      tryVerify(String(reader.result || ""));
    };
    reader.onerror = () => setErr("Could not read that file.");
    reader.readAsText(file);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-navy">Verify origin</h1>
        <p className="mx-auto mt-1 max-w-xl text-sm text-ink-2">
          Scan a product&apos;s QR or paste its provenance chain. The verifier walks the chain,
          checks every signature, and returns the Canadian-content designation with any integrity
          anomalies.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel label="scan qr" accent="navy">
          <QrScanner onScan={tryVerify} />
          <p className="mt-3 text-xs text-ink-3">
            Scans a QR encoding the product&apos;s provenance chain (or a single attestation).
          </p>
        </Panel>

        <Panel label="paste hash / chain" accent="navy">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) tryVerify(text);
            }}
          >
            <textarea
              id="ml-chain-json"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`{ "product_attestation_id": "att-…", "attestations": [ … ] }`}
              className="h-40 w-full resize-y rounded-btn border border-line-2 bg-paper px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-3 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy/30"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className={BTN_GHOST}>
                ⭱ upload JSON
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                onChange={onFile}
                className="hidden"
              />
              <button type="submit" disabled={!text.trim()} className={BTN_PRIMARY}>
                verify
              </button>
            </div>
            <p className="mt-1.5 text-xs text-ink-3">
              Full envelope, a bare attestations array, or one attestation.
            </p>
            {err && (
              <p className="mt-2 rounded-btn border-l-2 border-red bg-tint-red px-3 py-2 text-sm text-red">
                {err}
              </p>
            )}
          </form>
        </Panel>
      </div>

      <Panel label="demo" accent="navy" right="no QR handy?">
        <button
          type="button"
          onClick={() => onVerify(workedExampleChain)}
          className={`${BTN_PRIMARY} w-full`}
        >
          ▸ load worked example (recovery drone)
        </button>
        <p className="mt-1.5 text-xs text-ink-3">
          12 attestations · expected: <span className="text-navy">made_in_canada</span> · 58.4% · valid
        </p>

        <div className="my-3 border-t border-line" />

        <button
          type="button"
          onClick={() => onVerify(tamperedExampleChain)}
          className={`${BTN_GHOST} w-full`}
        >
          ⚠ load tampered example (upstream cost altered)
        </button>
        <p className="mt-1.5 text-xs text-ink-3">
          Same chain, one upstream parent&apos;s cost changed after signing · expected:{" "}
          <span className="text-red">parent_hash_mismatch</span> · designation{" "}
          <span className="text-red">none</span> · invalid
        </p>
      </Panel>
    </div>
  );
}

// ── User manual (field guide: section index + content pane) ─────────────────
// Documents the CURRENT (real challenge) contract and behaviour.
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
          A buyer loads a chain — the finished product plus all ancestors — and the verifier walks
          it, checks every signature against a registry of accredited suppliers, sums the production
          cost by country, and returns one of three designations plus any integrity anomalies.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b className="text-navy">Product of Canada</b> — ≥ 98% Canadian cost + last transformation in Canada.</li>
          <li><b className="text-navy">Made in Canada</b> — ≥ 51% Canadian cost + last transformation in Canada.</li>
          <li><b className="text-red">None</b> — neither condition met.</li>
        </ul>
      </>
    ),
  },
  {
    id: "process",
    title: "How verification works",
    body: (
      <>
        <p>A verification runs as a single stateless request:</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Load a chain and <b className="text-ink">POST</b> it to <code className="font-mono text-navy">/verify</code> as <code className="font-mono text-navy">{`{ product_attestation_id, attestations }`}</code>.</li>
          <li>The backend builds the provenance DAG from each attestation&apos;s <code className="font-mono text-navy">parents</code> (any order), guarding against cycles.</li>
          <li>Each node is checked: signature (Ed25519, registry key), known issuer, parent-hash binding, dangling parents, replay.</li>
          <li><b className="text-ink">Mass-balance:</b> a node may not consume more of an input than was produced upstream.</li>
          <li><b className="text-ink">Cost attribution:</b> each node&apos;s cost (material_cad + labour_cost_cad) is summed by <code className="font-mono text-navy">performed_in_country</code>.</li>
          <li><b className="text-ink">Verdict:</b> the 98% / 51% thresholds apply <i>and</i> the last substantial transformation must be in Canada.</li>
        </ol>
        <p className="text-ink-3">
          The response carries no graph; this terminal draws the chain-of-custody view from the
          attestations it submitted.
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
            <tr className="border-b border-line text-left text-ink-3">
              <th className="py-1.5 pr-3">Designation</th>
              <th className="pr-3">Canadian cost</th>
              <th>Last transformation</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="py-1.5 pr-3 font-medium text-navy">product_of_canada</td>
              <td className="pr-3">≥ 98%</td>
              <td>in Canada</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-1.5 pr-3 font-medium text-navy">made_in_canada</td>
              <td className="pr-3">≥ 51%</td>
              <td>in Canada</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-3 font-medium text-red">none</td>
              <td className="pr-3">&lt; 51%</td>
              <td>or not in Canada</td>
            </tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: "calculation",
    title: "Cost calculation",
    body: (
      <>
        <p>
          Each attestation&apos;s own cost is <code className="font-mono text-navy">material_cad + labour_cost_cad</code>,
          attributed to its <code className="font-mono text-navy">performed_in_country</code>. The Canadian percentage
          is a flat sum of Canadian cost over total cost across all attestations.
          <b className="text-ink"> labour_hours is not a cost</b> and does not enter the percentage.
        </p>
        <p>
          The <b className="text-navy">calculation detail</b> button on a result opens a breakdown:
          a cost-by-country share and a per-component contribution chart, derived locally from the
          submitted chain so you can see how the percentage was reached.
        </p>
      </>
    ),
  },
  {
    id: "integrity",
    title: "Integrity & anomaly types",
    body: (
      <>
        <p>
          The verifier returns <code className="font-mono text-navy">chain_valid</code> plus an{" "}
          <code className="font-mono text-navy">anomalies</code> list. Each anomaly is{" "}
          <code className="font-mono text-navy">{`{ type, attestation_id, details }`}</code>. The{" "}
          <code className="font-mono text-navy">type</code> is a free-form snake_case label — these are the
          common ones, but the set is not exhaustive:
        </p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink-3">
              <th className="py-1.5 pr-3">type</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["signature_invalid", "signature does not verify"],
              ["signature_unknown_supplier", "signer not in the registry"],
              ["parent_hash_mismatch", "parent content_hash ≠ recomputed hash"],
              ["mass_balance_violation", "consumed > produced upstream"],
              ["circular_reference", "references form a loop"],
              ["dangling_parent", "referenced parent missing from the chain"],
              ["timestamp_inversion", "input dated after its consumer"],
              ["unit_mismatch", "consumed unit ≠ parent output unit"],
            ].map(([r, m]) => (
              <tr key={r} className="border-b border-line align-top">
                <td className="py-1.5 pr-3 font-mono text-xs text-navy">{r}</td>
                <td className="text-ink-2">{m}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: "data-format",
    title: "Attestation data format",
    body: (
      <>
        <p>An attestation is the signed unit of provenance (challenge schema v1.0):</p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink-3">
              <th className="py-1.5 pr-3">Field</th>
              <th className="pr-3">Type</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["attestation_id", "string", "att- + UUID, globally unique"],
              ["supplier_id", "string", "maps to a registry key"],
              ["action_type", "enum", "raw_material_supply | component_manufacture | subassembly | final_integration"],
              ["performed_in_country", "string", "ISO-2 where THIS step's work occurred"],
              ["parents[]", "{ attestation_id, content_hash, quantity_consumed, unit }", "what it consumed"],
              ["output", "{ name, quantity_produced, unit }", "what this node produced"],
              ["costs", "{ material_cad, labour_hours, labour_cost_cad }", "CAD floats; hours ≥ 4 ⇒ ST"],
              ["timestamp", "string", "ISO-8601 UTC, Z suffix"],
              ["signature", "{ algorithm, value }", "ed25519, base64 over canonical bytes (signature excluded)"],
            ].map(([f, t, n]) => (
              <tr key={f} className="border-b border-line align-top">
                <td className="py-1.5 pr-3 font-mono text-xs text-navy">{f}</td>
                <td className="pr-3 text-ink-2">{t}</td>
                <td className="text-ink-3">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <pre className="overflow-x-auto rounded-btn border border-line-2 bg-paper-2 p-3 font-mono text-xs text-navy">{`{
  "attestation_id": "att-anchor-0005",
  "version": "1.0",
  "supplier_id": "sup-avss-corp",
  "timestamp": "2026-03-21T14:30:00Z",
  "action_type": "component_manufacture",
  "performed_in_country": "CA",
  "parents": [{ "attestation_id": "att-anchor-0001",
                "content_hash": "1ed6d6cc…", "quantity_consumed": 8.0, "unit": "m2" }],
  "output": { "name": "Parachute Recovery Assembly", "quantity_produced": 1, "unit": "units" },
  "costs": { "material_cad": 0.0, "labour_hours": 6.5, "labour_cost_cad": 520.0 },
  "signature": { "algorithm": "ed25519", "value": "<base64>" }
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
          Each supplier holds an <b className="text-ink">Ed25519 key pair</b>. The private key signs
          attestations; the public key is registered, once, into the supplier registry. The verifier
          looks up each <code className="font-mono text-navy">supplier_id</code> to get the trusted public key
          and verifies <code className="font-mono text-navy">signature.value</code> against the attestation&apos;s
          canonical bytes (with <code className="font-mono text-navy">signature</code> excluded).
        </p>
        <p>
          A valid signature is necessary but not sufficient: all private keys ship with the kit, so a
          sophisticated attacker can sign a fabricated chain. Robust detection also checks internal
          consistency — hashes, mass-balance, timestamps, plausibility.
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
          The provenance graph is the supply chain you submitted. Each node is a supplier
          contribution; arrows point from an input to the consumer that used it. It is drawn locally
          from the attestations&apos; <code className="font-mono text-navy">parents</code> references.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><span className="font-medium text-navy">Navy</span> — Canadian, no anomaly.</li>
          <li><span className="font-medium text-ink-2">Grey</span> — imported, no anomaly.</li>
          <li><span className="font-medium text-red">Red</span> — flagged by an anomaly in the response.</li>
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
          changes the designation. Value-add = labour share of a component&apos;s own cost.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b className="text-navy">critical</b> — a substantial transformation or high value-add (key IP).</li>
          <li><b className="text-ink">standard</b> — moderate transformation.</li>
          <li><b className="text-ink-2">commodity</b> — a raw-material input with little value-add.</li>
        </ul>
        <p>
          A <b className="text-red">critical</b> component made outside Canada is flagged
          <b className="text-red"> ⚠ offshore</b> — a strategic dependency worth watching.
        </p>
      </>
    ),
  },
];

function Manual({ onClose }) {
  const [active, setActive] = useState(MANUAL_SECTIONS[0].id);
  const section = MANUAL_SECTIONS.find((s) => s.id === active) || MANUAL_SECTIONS[0];
  return (
    <div className="fixed inset-0 z-50 flex bg-ink/40 p-4 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <div
        className="mx-auto flex h-full max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-card border border-line-2 bg-paper shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-line bg-paper-2 p-3">
          <div className="px-2 pb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-navy">
            Field guide
          </div>
          <nav className="space-y-0.5">
            {MANUAL_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(s.id)}
                className={
                  "block w-full rounded-btn px-3 py-1.5 text-left text-sm transition " +
                  (active === s.id
                    ? "bg-tint-navy font-medium text-navy"
                    : "text-ink-2 hover:bg-paper hover:text-ink")
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
            className="absolute right-4 top-4 rounded-btn border border-line-2 px-2 py-0.5 text-ink-2 transition hover:border-red hover:text-red"
          >
            ✕
          </button>
          <h2 className="text-lg font-semibold text-navy">
            {section.title}
          </h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-2">
            {section.body}
          </div>
        </div>
      </div>
    </div>
  );
}

function CostDetailModal({ result, cost, onClose }) {
  const total = cost?.totalCad || 0;
  const byCountry = cost?.byCountry || {};
  const pctOf = (c) => (total ? Math.round(((c || 0) / total) * 1000) / 10 : 0);

  // Cost-by-country share via conic-gradient (CA = navy, others red/grey shades).
  const palette = ["#d52b1e", "#b4554e", "#9aa0a6", "#5c6670", "#cdd2d7"];
  let acc = 0;
  let other = 0;
  const slices = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .map(([country, c]) => {
      const start = total ? (acc / total) * 360 : 0;
      acc += c;
      const end = total ? (acc / total) * 360 : 0;
      const color = country === "CA" ? "#26374a" : palette[other++ % palette.length];
      return { country, c, start, end, color };
    });
  const gradient =
    slices.length > 0
      ? `conic-gradient(${slices.map((s) => `${s.color} ${s.start}deg ${s.end}deg`).join(",")})`
      : "var(--color-line)";

  const nodes = (cost?.perNode || []).slice().sort((a, b) => (b.cad || 0) - (a.cad || 0));
  const maxContrib = Math.max(1, ...nodes.map((n) => n.cad || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-card border border-line-2 bg-paper shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-navy">
            calculation detail
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-btn border border-line-2 px-2 py-0.5 text-ink-2 transition hover:border-red hover:text-red"
          >
            ✕
          </button>
        </header>

        <div className="p-5">
          <p className="text-sm text-ink-2">
            Each component&apos;s cost (material + labour), attributed to where the work happened.
            Derived locally from the submitted chain; the headline percentage is the backend&apos;s.
          </p>

          <div className="mt-4 rounded-btn border border-line-2 bg-paper-2 p-4 text-center">
            <div className="text-3xl font-semibold tabular-nums text-navy">
              {formatPct(result.canadian_content_percentage)}
            </div>
            <div className="mt-1 text-sm text-ink-2">
              {formatCad(cost?.canadianCad)} Canadian of {formatCad(total)} total
            </div>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-ink-3">
              Product of Canada ≥ 98% · Made in Canada ≥ 51% (last transformation in Canada)
            </div>
          </div>

          <div className="mt-5 flex items-center gap-5">
            <div
              className="h-32 w-32 shrink-0 rounded-full ring-1 ring-line-2"
              style={{ background: gradient }}
              role="img"
              aria-label="Cost by country"
            />
            <ul className="space-y-1.5 text-sm">
              {slices.map((s) => (
                <li key={s.country} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span className="font-medium text-ink">{countryName(s.country)}</span>
                  <span className="text-ink-2">
                    {formatCad(s.c)} · {pctOf(s.c)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <h3 className="mt-6 mb-2 font-mono text-[11px] font-medium uppercase tracking-wider text-navy">
            Per-component contribution
          </h3>
          <ul className="space-y-2.5">
            {nodes.map((n) => {
              const c = n.cad || 0;
              const barColor = c === 0
                ? "var(--color-ink-3)"
                : n.country === "CA"
                ? "var(--color-navy)"
                : "var(--color-ink-3)";
              return (
                <li key={n.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink">
                      {n.name}{" "}
                      <span className="text-xs text-ink-3">· {n.supplier_id} · {n.country}</span>
                    </span>
                    <span className="text-ink-2">
                      {formatCad(c)} · {pctOf(c)}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full border border-line bg-paper-2">
                    <div
                      className="h-full"
                      style={{ width: `${Math.round((c / maxContrib) * 100)}%`, backgroundColor: barColor }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-5 text-xs text-ink-3">
            Navy = Canadian cost · grey = imported or zero-cost. These are the verified amounts the
            verdict was computed from.
          </p>
        </div>
      </div>
    </div>
  );
}

function CriticalityPanel({ nodes }) {
  const list = (nodes || []).filter((n) => n.component_class);
  if (list.length === 0) return null;
  const order = ["critical", "standard", "commodity"];
  const tone = {
    critical: "border-line-2 bg-tint-navy text-navy",
    standard: "border-line-2 bg-paper-2 text-ink",
    commodity: "border-line-2 bg-paper-2 text-ink-2",
  };
  return (
    <Panel label="strategic criticality" accent="navy" right="advisory">
      <p className="text-sm text-ink-2">
        An advisory lens, separate from the legal verdict. Value-add = labour share of a
        component&apos;s own cost. A <span className="font-medium text-navy">critical</span>{" "}
        component made outside Canada is the strategic risk to watch.
      </p>
      <p className="mt-1.5 text-[11px] text-ink-3">
        Derived locally from the submitted chain — not returned or asserted by the verifier.
      </p>
      <ul className="mt-3 space-y-2">
        {order.flatMap((cls) =>
          list
            .filter((n) => n.component_class === cls)
            .map((n) => (
              <li
                key={n.id}
                className={"flex items-center justify-between rounded-btn border px-3 py-2 text-sm " + tone[cls]}
              >
                <span className="flex items-center gap-2">
                  <span>
                    {n.name}{" "}
                    <span className="text-xs opacity-70">· {n.supplier_id} · {n.country}</span>
                  </span>
                  {cls === "critical" && n.country !== "CA" && (
                    <span className="rounded-chip bg-tint-red px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red">
                      ⚠ offshore
                    </span>
                  )}
                </span>
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider">
                  {cls} · {Math.round((n.value_add_pct || 0) * 100)}% value-add
                </span>
              </li>
            ))
        )}
      </ul>
    </Panel>
  );
}
