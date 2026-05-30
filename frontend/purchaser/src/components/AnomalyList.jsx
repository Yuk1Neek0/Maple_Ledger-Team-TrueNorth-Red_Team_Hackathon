// AnomalyList: integrity findings from the verifier. Hard failures read loud
// (red on tint-red), advisories read soft (muted ink). A clean chain shows a
// single ok-green line.

import { anomalyLabel, anomalyAdvisory } from "../labels.js";

export default function AnomalyList({ anomalies }) {
  const list = anomalies || [];
  if (list.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-btn border border-ok/30 bg-tint-ok px-3 py-2 text-sm text-ok">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
        no anomalies — chain clean
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {list.map((a, i) => {
        const advisory = anomalyAdvisory(a);
        // Hard failures are red; advisories are muted neutral (no red).
        const textColor = advisory ? "text-ink-2" : "text-red";
        const dotColor = advisory ? "bg-ink-3" : "bg-red";
        const borderColor = advisory ? "border-line-2" : "border-red/40";
        const bgColor = advisory ? "bg-paper-2" : "bg-tint-red";
        return (
          <div key={i} className={`rounded-btn border ${borderColor} ${bgColor} px-3 py-2`}>
            <div className="flex items-center justify-between">
              <span className={`flex items-center gap-2 text-sm font-medium ${textColor}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden />
                {anomalyLabel(a.type)}
              </span>
              {advisory && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">advisory</span>
              )}
            </div>
            {a.attestation_id && (
              <div className="mt-1 pl-3.5 font-mono text-xs text-ink-2">{a.attestation_id}</div>
            )}
            {a.details && (
              <div className="mt-0.5 pl-3.5 text-xs text-ink-3">{a.details}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
