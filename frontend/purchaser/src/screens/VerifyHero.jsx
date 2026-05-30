import { useRef, useState } from "react";
import { parseChainInput } from "../chain.js";
import { workedExampleChain, tamperedExampleChain } from "../fixtures.js";
import QrScanner from "../components/QrScanner.jsx";
import Panel from "../components/ui/Panel.jsx";

const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-btn bg-navy px-4 py-2 text-sm font-medium text-paper transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_GHOST =
  "inline-flex items-center justify-center gap-2 rounded-btn border border-line-2 bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:bg-paper-2";

export default function VerifyHero({ onVerify }) {
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
    e.target.value = "";
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
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="rounded-card border border-line bg-paper p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold tracking-tight text-navy">Verify origin</h1>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">
              Load a provenance chain from QR, uploaded JSON, or pasted attestation data. The
              verifier checks signatures, parent hashes, mass balance, designation thresholds, and
              anomaly status through the live <span className="font-mono text-navy">POST /verify</span> backend.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["1", "Load chain"],
              ["2", "Verify"],
              ["3", "Review result"],
            ].map(([n, label]) => (
              <div key={label} className="min-w-[88px] rounded-btn border border-line bg-paper-2 px-3 py-2">
                <div className="mx-auto grid h-6 w-6 place-items-center rounded-full bg-navy text-xs font-bold text-paper">{n}</div>
                <div className="mt-1 text-[11px] font-semibold text-ink-2">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel label="product attestation input" accent="navy" right="live verification">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) tryVerify(text);
            }}
          >
            <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_auto]">
              <div>
                <div className="text-sm font-semibold text-ink">Paste chain JSON</div>
                <p className="mt-0.5 text-xs text-ink-3">
                  Accepts a full envelope, a bare attestations array, or one signed attestation.
                </p>
              </div>
              <button type="button" onClick={() => fileRef.current?.click()} className={BTN_GHOST}>
                upload JSON
              </button>
            </div>
            <textarea
              id="ml-chain-json"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`{ "product_attestation_id": "att-…", "attestations": [ … ] }`}
              className="h-64 w-full resize-y rounded-btn border border-line-2 bg-paper px-3 py-2 font-mono text-xs leading-relaxed text-ink placeholder:text-ink-3 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy/30"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                onChange={onFile}
                className="hidden"
              />
              <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
                Contract: {"{ product_attestation_id, attestations[] }"}
              </div>
              <button type="submit" disabled={!text.trim()} className={`${BTN_PRIMARY} min-w-28`}>
                verify
              </button>
            </div>
            {err && (
              <p className="mt-2 rounded-btn border-l-2 border-red bg-tint-red px-3 py-2 text-sm text-red">
                {err}
              </p>
            )}
          </form>
        </Panel>

        <div className="space-y-5">
          <Panel label="scan qr" accent="navy">
            <QrScanner onScan={tryVerify} />
            <p className="mt-3 text-xs text-ink-3">
              Scans a QR encoding a full chain or one signed attestation.
            </p>
          </Panel>

          <Panel label="demo chains" accent="navy" right="known outcomes">
            <button
              type="button"
              onClick={() => onVerify(workedExampleChain)}
              className={`${BTN_PRIMARY} w-full`}
            >
              load worked example (recovery drone)
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
              load tampered example (upstream cost altered)
            </button>
            <p className="mt-1.5 text-xs text-ink-3">
              Same chain, one upstream parent&apos;s cost changed after signing · expected:{" "}
              <span className="text-red">parent_hash_mismatch</span> · designation{" "}
              <span className="text-red">none</span> · invalid
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
