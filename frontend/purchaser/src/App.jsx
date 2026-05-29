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
          <ModeBadge />
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
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-slate-400">
        Cryptographic-provenance verifier · demo build
      </footer>
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
        a component's own cost.
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
                <span>
                  {n.product_id}{" "}
                  <span className="text-xs opacity-70">· {n.supplier_id}</span>
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
