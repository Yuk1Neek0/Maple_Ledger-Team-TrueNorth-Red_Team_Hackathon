import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import Panel from "./ui/Panel.jsx";

// Camera QR scanner styled as an acquisition viewport. Calls onResult(text)
// with the decoded string, then stops the camera. Manual hash entry is always
// available so the terminal is fully testable without a camera.

const SCAN_REGION_ID = "ml-qr-scan-region";

export default function QrScanner({ onResult, disabled }) {
  const scannerRef = useRef(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [manual, setManual] = useState("");

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  async function stopCamera() {
    const inst = scannerRef.current;
    scannerRef.current = null;
    if (inst) {
      try {
        await inst.stop();
      } catch {
        /* already stopped */
      }
      try {
        inst.clear();
      } catch {
        /* ignore */
      }
    }
  }

  async function startCamera() {
    setError(null);
    setStarting(true);
    try {
      const html5Qr = new Html5Qrcode(SCAN_REGION_ID, { verbose: false });
      scannerRef.current = html5Qr;
      setActive(true);
      await html5Qr.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => handleResult(decodedText),
        () => {
          /* per-frame decode failure — ignore */
        }
      );
    } catch (err) {
      setActive(false);
      scannerRef.current = null;
      const msg = String(err?.message || err);
      if (/secure context|https/i.test(msg)) {
        setError("Camera needs a secure context. Open this page on http://localhost or over HTTPS.");
      } else if (/permission|NotAllowed/i.test(msg)) {
        setError("Camera permission denied. Allow it, or enter the code below.");
      } else if (/NotFound|no camera/i.test(msg)) {
        setError("No camera found. Enter the product code below instead.");
      } else {
        setError(`Could not start the camera: ${msg}`);
      }
    } finally {
      setStarting(false);
    }
  }

  function handleResult(text) {
    stopCamera();
    setActive(false);
    if (text && text.trim()) onResult(text.trim());
  }

  function submitManual(e) {
    e.preventDefault();
    if (manual.trim()) onResult(manual.trim());
  }

  return (
    <Panel label="acquire" accent="cyan" right={active ? "camera live" : "standby"}>
      <p className="prose-sans text-sm text-dim">
        Point the camera at a product&apos;s Maple Ledger code, or key the root hash directly.
      </p>

      {/* viewport with framing brackets + sweep line */}
      <div className="relative mt-4">
        <div
          id={SCAN_REGION_ID}
          className={`relative overflow-hidden border border-line-bright bg-base ${
            active ? "block" : "hidden"
          }`}
        />
        {active && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="scan-sweep h-8 w-full bg-gradient-to-b from-transparent via-cyan/30 to-transparent" />
            <span className="absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 border-cyan" />
            <span className="absolute right-0 top-0 h-4 w-4 border-r-2 border-t-2 border-cyan" />
            <span className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-cyan" />
            <span className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-cyan" />
          </div>
        )}
      </div>

      {!active ? (
        <button
          type="button"
          onClick={startCamera}
          disabled={disabled || starting}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 border border-cyan bg-cyan/10 px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-cyan transition hover:bg-cyan/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {starting ? "starting camera…" : "▸ start camera"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            stopCamera();
            setActive(false);
          }}
          className="mt-4 inline-flex w-full items-center justify-center border border-line px-4 py-2.5 text-sm font-medium uppercase tracking-[0.16em] text-dim transition hover:border-line-bright hover:text-ink"
        >
          ■ stop camera
        </button>
      )}

      {error && (
        <p className="mt-3 border-l-2 border-amber bg-amber/10 px-3 py-2 text-sm text-amber">
          {error}
        </p>
      )}

      <form onSubmit={submitManual} className="mt-4 border-t border-line pt-4">
        <label
          htmlFor="ml-manual-hash"
          className="text-[11px] uppercase tracking-[0.16em] text-dim"
        >
          Manual entry — root hash
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="ml-manual-hash"
            type="text"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="a3f19c4e7b2d8f01…"
            className="min-w-0 flex-1 border border-line bg-base px-3 py-2 font-mono text-sm text-ink placeholder:text-faint focus:border-cyan focus:outline-none"
          />
          <button
            type="submit"
            disabled={disabled || !manual.trim()}
            className="border border-signal/60 bg-signal/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-signal transition hover:bg-signal/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            verify
          </button>
        </div>
      </form>
    </Panel>
  );
}
