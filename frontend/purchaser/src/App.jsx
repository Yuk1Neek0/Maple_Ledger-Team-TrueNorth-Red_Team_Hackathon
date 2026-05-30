import { useCallback, useEffect, useMemo, useState } from "react";
import { createVerification, buildVerificationView } from "./services/verification.js";
import { BACKEND_URL } from "./config.js";
import Panel from "./components/ui/Panel.jsx";
import { StatusNode } from "./components/ui/Readout.jsx";
import BootSequence from "./components/ui/BootSequence.jsx";
import Shell from "./components/ui/Shell.jsx";
import PurchaserDashboard from "./screens/PurchaserDashboard.jsx";
import VerifyHero from "./screens/VerifyHero.jsx";
import VerificationResult from "./screens/VerificationResult.jsx";

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
  const [view, setView] = useState(() =>
    window.location.hash === "#verify-product" ? "verify" : "dashboard"
  );
  const [chain, setChain] = useState(null); // the submitted { product_attestation_id, attestations }
  const [result, setResult] = useState(null); // the real /verify response
  const [verification, setVerification] = useState(null); // normalized product-style view model
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [error, setError] = useState(null);
  const [showManual, setShowManual] = useState(false);

  // Derived view models — recomputed only when the verified chain/result change.
  const graph = useMemo(
    () => verification?.graph || buildVerificationView(chain, result).graph,
    [chain, result, verification]
  );
  const cost = useMemo(
    () => verification?.cost || buildVerificationView(chain, result).cost,
    [chain, result, verification]
  );
  const crit = useMemo(
    () => verification?.criticality || buildVerificationView(chain, result).criticality,
    [chain, result, verification]
  );

  useEffect(() => {
    function onHashChange() {
      setView(window.location.hash === "#verify-product" ? "verify" : "dashboard");
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const runVerify = useCallback(async (loaded) => {
    setChain(loaded);
    setResult(null);
    setVerification(null);
    setError(null);
    setStatus("loading");
    try {
      const next = await createVerification(loaded);
      setVerification(next);
      setResult(next.result);
      setStatus("done");
    } catch (err) {
      setError(err.message || String(err));
      setStatus("error");
    }
  }, []);

  const reset = useCallback(() => {
    setChain(null);
    setResult(null);
    setVerification(null);
    setStatus("idle");
    setError(null);
  }, []);

  const openVerify = useCallback(() => {
    window.location.hash = "verify-product";
    setView("verify");
  }, []);

  const backToDashboard = useCallback(() => {
    reset();
    window.location.hash = "";
    setView("dashboard");
  }, [reset]);

  const inVerifyFlow = view === "verify" || status !== "idle";

  return (
    <Shell
      active="purchaser"
      context={inVerifyFlow ? "Verify Product" : "Dashboard"}
      subtitle={inVerifyFlow ? "Run a live provenance verification" : "Provenance, Canadian content & anomalies"}
      activeNav={inVerifyFlow ? "Verify Product" : "Dashboard"}
      dense={status === "done"}
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

        {status === "idle" && view === "dashboard" && (
          <PurchaserDashboard onVerifyProduct={openVerify} />
        )}

        {status === "idle" && view === "verify" && (
          <div>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-navy">Verify Product</h1>
                <p className="mt-1 text-sm text-ink-2">
                  Scan a QR code, upload JSON, or load a demo chain. This page calls the live POST /verify backend.
                </p>
              </div>
              <button type="button" onClick={backToDashboard} className={BTN_GHOST}>
                back to dashboard
              </button>
            </div>
            <VerifyHero onVerify={runVerify} />
          </div>
        )}

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
          <VerificationResult
            result={result}
            chain={chain}
            graph={graph}
            cost={cost}
            criticality={crit}
            onBack={backToDashboard}
            onVerifyAnother={() => {
              reset();
              setView("verify");
              window.location.hash = "verify-product";
            }}
          />
        )}
      </main>

      {showManual && <Manual onClose={() => setShowManual(false)} />}
    </Shell>
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
