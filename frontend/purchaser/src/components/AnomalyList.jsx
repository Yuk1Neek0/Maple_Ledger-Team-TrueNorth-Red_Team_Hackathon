import { anomalyDetail, anomalyLabel } from "../labels.js";

// Integrity findings rendered as a verification log. Each entry is a real
// anomaly: { type, attestation_id, details }. The real contract treats every
// listed anomaly as an integrity violation (chain_valid === false), so all rows
// render as alarm-red [FAIL].
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

  return (
    <div className="border border-line bg-base">
      {list.map((a, i) => (
        <LogRow key={`${a.attestation_id || "?"}-${i}`} anomaly={a} />
      ))}
    </div>
  );
}

function LogRow({ anomaly }) {
  const id = anomaly.attestation_id || "";
  return (
    <div className="border-b border-line bg-alarm/[0.06] px-3 py-2.5 last:border-b-0">
      <div className="flex items-center gap-2 text-sm">
        <span className="shrink-0 bg-alarm/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-alarm">
          fail
        </span>
        <span className="font-medium text-alarm">{anomalyLabel(anomaly.type)}</span>
        {id && (
          <span className="ml-auto truncate font-mono text-xs text-faint" title={id}>
            {id}
          </span>
        )}
      </div>
      <p className="prose-sans mt-1 pl-[2.85rem] text-xs leading-relaxed text-dim">
        {anomalyDetail(anomaly)}
      </p>
    </div>
  );
}
