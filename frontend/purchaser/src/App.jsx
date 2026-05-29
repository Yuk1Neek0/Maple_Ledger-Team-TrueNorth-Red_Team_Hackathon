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
      // TODO(integration): replace mockGraph with real topology once /verify
      // (or a sibling endpoint) returns nodes + edges.
      setGraph(mockGraph);
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
