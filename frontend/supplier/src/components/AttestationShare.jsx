// AttestationShare: the post-sign "share" surface for an issued attestation.
//
// Two actions from the design doc's Review & Sign / QR panel (§11.2, §11.3):
//   • Download JSON  — saves the signed body as a file.
//   • Generate QR    — renders a QR encoding the signed attestation so the
//                      purchaser app can scan it. The purchaser's parseChainInput
//                      accepts a single attestation object, wrapping it into a
//                      { product_attestation_id, attestations:[...] } chain — so
//                      one attestation round-trips end to end.
//
// QR capacity: a single signed attestation is ~0.6–1 kB, which fits in a
// byte-mode QR at error-correction level "M". Whole multi-node chains are far
// too large for a QR and are shared as JSON instead.

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import Panel from "./ui/Panel.jsx";

const BTN_GHOST =
  "inline-flex items-center justify-center gap-2 rounded-btn border border-line-2 bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:bg-paper-2 disabled:opacity-40";

export default function AttestationShare({ signedBody }) {
  const canvasRef = useRef(null);
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");

  const json = signedBody ? JSON.stringify(signedBody, null, 2) : "";
  const qrText = signedBody ? JSON.stringify(signedBody) : "";
  const attId = signedBody?.attestation_id || "attestation";

  // Render the QR whenever it's shown (canvas mounts only while open).
  useEffect(() => {
    if (!show || !canvasRef.current || !qrText) return;
    setErr("");
    QRCode.toCanvas(
      canvasRef.current,
      qrText,
      { errorCorrectionLevel: "M", margin: 2, width: 232, color: { dark: "#26374a", light: "#ffffff" } },
      (e) => {
        if (e) setErr("Attestation is too large to encode as a QR — use Download JSON instead.");
      }
    );
  }, [show, qrText]);

  function downloadJson() {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${attId}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!signedBody) return null;

  return (
    <Panel label="share" accent="navy" right="hand off to a purchaser">
      <p className="text-sm text-ink-2">
        Hand this signed attestation to a buyer: download the JSON, or show the QR for the
        purchaser app to scan and verify.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={downloadJson} className={BTN_GHOST}>
          ⭳ download JSON
        </button>
        <button type="button" onClick={() => setShow((s) => !s)} className={BTN_GHOST}>
          {show ? "hide QR" : "▦ generate QR"}
        </button>
      </div>

      {show && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="rounded-card border border-line-2 bg-paper p-3">
            <canvas ref={canvasRef} aria-label={`QR code for ${attId}`} />
          </div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
            {attId}
          </p>
          {err && (
            <p className="mt-1 rounded-btn border-l-2 border-red bg-tint-red px-3 py-2 text-sm text-red">
              {err}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
