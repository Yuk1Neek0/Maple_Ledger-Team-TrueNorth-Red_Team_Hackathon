// A single telemetry row: LABEL ········· VALUE, with a dotted leader between.
// `tone` colors the value; `glow` adds a phosphor halo for headline signals.

const TONE = {
  ink: "text-ink",
  signal: "text-signal",
  amber: "text-amber",
  alarm: "text-alarm",
  cyan: "text-cyan",
  dim: "text-dim",
};

const GLOW = {
  signal: "glow-signal",
  amber: "glow-amber",
  alarm: "glow-alarm",
};

export default function Readout({ label, value, tone = "ink", glow = false, mono = true }) {
  return (
    <div className="leader text-sm">
      <span className="uppercase tracking-[0.12em] text-[11px] text-dim">
        {label}
      </span>
      <span className="leader-fill" aria-hidden />
      <span
        className={`${mono ? "tabular-nums" : ""} font-medium ${TONE[tone] || TONE.ink} ${
          glow ? GLOW[tone] || "" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// A small status node: ● LABEL, blinking when live.
export function StatusNode({ tone = "signal", label, blink = false }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em]">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          { signal: "bg-signal", amber: "bg-amber", alarm: "bg-alarm", cyan: "bg-cyan", dim: "bg-faint" }[tone]
        } ${blink ? "blink" : ""}`}
      />
      <span className={TONE[tone] || TONE.ink}>{label}</span>
    </span>
  );
}
