// Instrument panel: a framed surface with a bracketed header label and corner
// ticks. The visual backbone of the control-room UI. Accent tints the label and
// the optional status node on the right of the header.

const ACCENT = {
  cyan: "text-cyan",
  signal: "text-signal",
  amber: "text-amber",
  alarm: "text-alarm",
  dim: "text-dim",
};

function CornerTicks() {
  // four L-brackets, one per corner — the "calibrated instrument" tell
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
    <section
      className={`relative border border-line bg-panel ${className}`}
    >
      <CornerTicks />
      {(label || right) && (
        <header className="flex items-center justify-between border-b border-line px-3 py-1.5">
          <span
            className={`text-[11px] font-medium uppercase tracking-[0.18em] ${ACCENT[accent] || ACCENT.cyan}`}
          >
            {label}
          </span>
          {right && (
            <span className="text-[11px] uppercase tracking-[0.14em] text-dim">
              {right}
            </span>
          )}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}
