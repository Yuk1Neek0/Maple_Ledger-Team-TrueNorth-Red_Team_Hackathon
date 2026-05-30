// Card: a clean paper surface with a mono section label. The structural
// primitive shared by every section. Shared verbatim with the purchaser app.

const ACCENT = {
  navy: "text-navy",
  ink: "text-ink",
  ok: "text-ok",
  red: "text-red",
  muted: "text-ink-3",
  // legacy accent names still passed by some call sites → map to the light system
  cyan: "text-navy",
  signal: "text-ok",
  amber: "text-navy",
  alarm: "text-red",
  dim: "text-ink-3",
};

export default function Panel({
  label,
  accent = "navy",
  right = null,
  children,
  bodyClass = "p-4",
  className = "",
}) {
  return (
    <section
      className={`rounded-card border border-line-2 bg-paper ${className}`}
    >
      {(label || right) && (
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span
            className={`font-mono text-[11px] font-medium uppercase tracking-wider ${ACCENT[accent] || ACCENT.navy}`}
          >
            {label}
          </span>
          {right && (
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
              {right}
            </span>
          )}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

// A small status node: ● LABEL.
export function StatusNode({ tone = "ok", label, blink = false }) {
  const dot = {
    ok: "bg-ok",
    signal: "bg-ok",
    navy: "bg-navy",
    red: "bg-red",
    alarm: "bg-red",
    amber: "bg-navy",
    cyan: "bg-navy",
    dim: "bg-ink-3",
  };
  const txt = {
    ok: "text-ok",
    signal: "text-ok",
    navy: "text-navy",
    red: "text-red",
    alarm: "text-red",
    amber: "text-navy",
    cyan: "text-navy",
    dim: "text-ink-3",
  };
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${dot[tone] || dot.ok}`}
        aria-hidden
      />
      <span className={txt[tone] || txt.ok}>{label}</span>
    </span>
  );
}
