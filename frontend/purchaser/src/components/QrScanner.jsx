import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

// A self-contained camera QR scanner. Calls onResult(text) with the decoded
// string, then stops the camera. Camera access requires a secure context
// (HTTPS or http://localhost) — see the hint shown on permission failure.
//
// We also expose a manual text-entry fallback so the UI is fully testable
// without a working camera (e.g. headless CI, no webcam, or a denied prompt).

const SCAN_REGION_ID = "ml-qr-scan-region";

export default function QrScanner({ onResult, disabled }) {
  const scannerRef = useRef(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [manual, setManual] = useState("");

  // Stop & clean up the camera when unmounting. stopCamera only touches a ref,
  // so it is safe to call from a mount-only effect.
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
        // isScanning may be true even mid-start; guard with try/catch.
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
        (decodedText) => {
          // Hand off the result, then tear the camera down.
          handleResult(decodedText);
        },
        () => {
          /* per-frame decode failure — ignore, this fires constantly */
        }
      );
    } catch (err) {
      setActive(false);
      scannerRef.current = null;
      const msg = String(err?.message || err);
      if (/secure context|https/i.test(msg)) {
        setError(
          "Camera needs a secure context. Open this page on http://localhost or over HTTPS."
        );
      } else if (/permission|NotAllowed/i.test(msg)) {
        setError("Camera permission denied. Allow it, or type the code below.");
      } else if (/NotFound|no camera/i.test(msg)) {
        setError("No camera found. Type the product code below instead.");
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">Scan a product</h2>
      <p className="mt-1 text-sm text-slate-500">
        Point your camera at the product’s Maple Ledger QR code.
      </p>

      {/* Camera viewport — html5-qrcode injects a <video> here. */}
      <div
        id={SCAN_REGION_ID}
        className={`mt-4 overflow-hidden rounded-xl bg-slate-900/5 ${
          active ? "block" : "hidden"
        }`}
      />

      {!active && (
        <button
          type="button"
          onClick={startCamera}
          disabled={disabled || starting}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {starting ? "Starting camera…" : "Start camera"}
        </button>
      )}

      {active && (
        <button
          type="button"
          onClick={() => {
            stopCamera();
            setActive(false);
          }}
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-slate-300 px-4 py-2.5 font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Stop camera
        </button>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </p>
      )}

      {/* Manual entry fallback — always available. */}
      <form onSubmit={submitManual} className="mt-4 border-t border-slate-100 pt-4">
        <label
          htmlFor="ml-manual-hash"
          className="text-sm font-medium text-slate-600"
        >
          Or enter a root hash manually
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="ml-manual-hash"
            type="text"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="e.g. a3f19c4e7b2d8f01"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <button
            type="submit"
            disabled={disabled || !manual.trim()}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Verify
          </button>
        </div>
      </form>
    </div>
  );
}
