// QrScanner: scan a QR with the device camera, or paste a hash manually.
// Renders a framed camera viewport; falls back to a manual entry box. Uses
// html5-qrcode for decode.

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

const READER_ID = "ml-qr-reader";

export default function QrScanner({ onScan }) {
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState("");
  const qrRef = useRef(null);

  useEffect(() => {
    return () => {
      // cleanup on unmount
      if (qrRef.current) {
        qrRef.current.stop().catch(() => {});
      }
    };
  }, []);

  async function start() {
    setErr("");
    setScanning(true);
    try {
      const qr = new Html5Qrcode(READER_ID);
      qrRef.current = qr;
      await qr.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decoded) => {
          onScan(decoded);
          qr.stop().catch(() => {});
          setScanning(false);
        },
        () => {}
      );
    } catch (e) {
      setErr(e.message || "Could not access camera.");
      setScanning(false);
    }
  }

  return (
    <div>
      <div
        id={READER_ID}
        className="relative mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-card border border-line-2 bg-paper-2"
      >
        {!scanning && (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-xs uppercase tracking-wider text-ink-3">
            camera idle
          </div>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-red">{err}</p>}
      <button
        type="button"
        onClick={start}
        disabled={scanning}
        className="mt-3 w-full rounded-btn bg-navy px-4 py-2 text-sm font-medium text-paper transition hover:bg-navy/90 disabled:opacity-40"
      >
        {scanning ? "scanning…" : "▸ scan QR"}
      </button>
    </div>
  );
}
