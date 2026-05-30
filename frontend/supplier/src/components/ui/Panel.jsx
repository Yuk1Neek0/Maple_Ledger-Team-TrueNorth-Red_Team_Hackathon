// Instrument panel: a framed surface with a bracketed header label and corner
// ticks. Shared with the purchaser app — the visual backbone of the UI.

const ACCENT = {
  cyan: "text-cyan",
  signal: "text-signal",
  amber: "text-amber",
  alarm: "text-alarm",
  dim: "text-dim",
};

function CornerTicks() {
  const base = "pointer-events-none absolute h-2 w-2 border-line-bright";
  return (
    <>
      <span className={`${base} left-0 top-0 border-l border-t`} />
      <span className={`${base} right-0 top-0 border-r border-t`} />
      <span className={`${base} bottom-0 left-0 border-b border-l`} />
      <span className={`${base} bottom-0 right-0 border-b border-r`} />
    </>
  );
}

export default function Panel({
  label,
  accent = "cyan",
  right = null,
  children,
  bodyClass = "p-4",
  className = "",
}) {
  return (
    <section className={`relative border border-line bg-panel ${className}`}>
      <CornerTicks />
      {(label || right) && (
        <header className="flex items-center justify-between border-b border-line px-3 py-1.5">
          <span
            className={`text-[11px] font-medium uppercase tracking-[0.18em] ${ACCENT[accent] || ACCENT.cyan}`}
          >
            {label}
          </span>
          {right && (
            <span className="text-[11px] uppercase tracking-[0.14em] text-dim">{right}</span>
          )}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

// A small status node: ● LABEL, blinking when live.
export function StatusNode({ tone = "signal", label, blink = false }) {
  const dot = { signal: "bg-signal", amber: "bg-amber", alarm: "bg-alarm", cyan: "bg-cyan", dim: "bg-faint" };
  const txt = { signal: "text-signal", amber: "text-amber", alarm: "text-alarm", cyan: "text-cyan", dim: "text-dim" };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em]">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot[tone]} ${blink ? "blink" : ""}`} />
      <span className={txt[tone]}>{label}</span>
    </span>
  );
}
