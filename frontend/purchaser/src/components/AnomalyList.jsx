import { anomalyDetail, anomalyLabel } from "../labels.js";

// Integrity findings rendered as a verification log. Hard failures (advisory:
// false) are alarm-red [FAIL] rows; advisory items are amber [ADV] rows.
export default function AnomalyList({ anomalies }) {
  const list = Array.isArray(anomalies) ? anomalies : [];

  if (list.length === 0) {
    return (
      <div className="flex items-center gap-2 border border-signal/30 bg-signal/5 px-3 py-2.5 text-sm text-signal">
        <span aria-hidden>✓</span>
        <span className="uppercase tracking-[0.12em] text-[12px]">
          no integrity issues · chain verified clean
        </span>
      </div>
    );
  }

  const hard = list.filter((a) => !a.advisory);
  const advisory = list.filter((a) => a.advisory);

  return (
    <div className="border border-line bg-base">
      {hard.map((a, i) => (
        <LogRow key={`h-${i}`} anomaly={a} variant="hard" />
      ))}
      {advisory.map((a, i) => (
        <LogRow key={`a-${i}`} anomaly={a} variant="advisory" />
      ))}
    </div>
  );
}

function LogRow({ anomaly, variant }) {
  const hard = variant === "hard";
  const shortHash = (anomaly.attestation_hash || "").slice(0, 16);
  return (
    <div className={`border-b border-line px-3 py-2.5 last:border-b-0 ${hard ? "bg-alarm/[0.06]" : ""}`}>
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
            hard ? "bg-alarm/15 text-alarm" : "bg-amber/15 text-amber"
          }`}
        >
          {hard ? "fail" : "adv"}
        </span>
        <span className={`font-medium ${hard ? "text-alarm" : "text-amber"}`}>
          {anomalyLabel(anomaly.reason)}
        </span>
        {shortHash && (
          <span className="ml-auto truncate font-mono text-xs text-faint">{shortHash}…</span>
        )}
      </div>
      <p className="prose-sans mt-1 pl-[2.85rem] text-xs leading-relaxed text-dim">
        {anomalyDetail(anomaly)}
      </p>
    </div>
  );
}
