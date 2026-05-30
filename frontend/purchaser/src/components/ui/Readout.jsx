// A single row: LABEL ········· VALUE, with a dotted leader between.
// `tone` colors the value. Key figures use the navy tone.

const TONE = {
  ink: "text-ink",
  navy: "text-navy",
  ok: "text-ok",
  red: "text-red",
  muted: "text-ink-3",
  // legacy tone names → light system
  signal: "text-ok",
  amber: "text-navy",
  alarm: "text-red",
  cyan: "text-navy",
  dim: "text-ink-2",
};

export default function Readout({ label, value, tone = "ink", glow = false, mono = true }) {
  void glow; // glow retired in the light system
  return (
    <div className="leader text-sm">
      <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
        {label}
      </span>
      <span className="leader-fill" aria-hidden />
      <span
        className={`${mono ? "tabular-nums" : ""} font-medium ${TONE[tone] || TONE.ink}`}
      >
        {value}
      </span>
    </div>
  );
}

// A small status node: ● LABEL.
export function StatusNode({ tone = "ok", label, blink = false }) {
  void blink;
  const dot = {
    ok: "bg-ok",
    navy: "bg-navy",
    red: "bg-red",
    signal: "bg-ok",
    amber: "bg-navy",
    alarm: "bg-red",
    cyan: "bg-navy",
    dim: "bg-ink-3",
  };
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${dot[tone] || dot.ok}`}
        aria-hidden
      />
      <span className={TONE[tone] || TONE.ink}>{label}</span>
    </span>
  );
}
