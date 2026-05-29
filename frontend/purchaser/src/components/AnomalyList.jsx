import { anomalyDetail, anomalyLabel } from "../labels.js";

// Renders the anomaly list. Hard failures (advisory:false) are loud red cards;
// advisory items (advisory:true) are muted amber/grey and visually secondary.
export default function AnomalyList({ anomalies }) {
  const list = Array.isArray(anomalies) ? anomalies : [];

  if (list.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <span aria-hidden className="text-base">✓</span>
        No integrity issues detected. The provenance chain verified cleanly.
      </div>
    );
  }

  const hard = list.filter((a) => !a.advisory);
  const advisory = list.filter((a) => a.advisory);

  return (
    <div className="space-y-3">
      {hard.map((a, i) => (
        <AnomalyCard key={`h-${i}`} anomaly={a} variant="hard" />
      ))}
      {advisory.map((a, i) => (
        <AnomalyCard key={`a-${i}`} anomaly={a} variant="advisory" />
      ))}
    </div>
  );
}

function AnomalyCard({ anomaly, variant }) {
  const hard = variant === "hard";
  const shortHash = (anomaly.attestation_hash || "").slice(0, 12);

  return (
    <div
      className={
        hard
          ? "rounded-xl border-l-4 border-red-500 bg-red-50 px-4 py-3"
          : "rounded-xl border-l-4 border-amber-300 bg-amber-50/60 px-4 py-3"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={hard ? "text-red-600" : "text-amber-500"}
          >
            {hard ? "⚠" : "ⓘ"}
          </span>
          <span
            className={`font-semibold ${
              hard ? "text-red-800" : "text-amber-800"
            }`}
          >
            {anomalyLabel(anomaly.reason)}
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
            hard
              ? "bg-red-100 text-red-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {hard ? "Failure" : "Advisory"}
        </span>
      </div>
      <p
        className={`mt-1.5 text-sm ${
          hard ? "text-red-700" : "text-amber-800/80"
        }`}
      >
        {anomalyDetail(anomaly)}
      </p>
      {shortHash && (
        <p className="mt-1 font-mono text-xs text-slate-500">
          {shortHash}…
        </p>
      )}
    </div>
  );
}
