// Machine-readable zone: renders a content hash like a passport MRZ — a fixed
// monospace band, chunked in groups of 4 for legibility. The cryptographic root
// is a deliberate visual feature rather than buried grey text.

export default function HashStrip({ hash, label = "ROOT", width = 44 }) {
  const clean = String(hash || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const padded = clean.length >= width
    ? clean.slice(0, width)
    : clean + "<".repeat(width - clean.length);
  // chunk into groups of 4 for scan-ability
  const chunks = padded.match(/.{1,4}/g) || [];

  return (
    <div className="rounded-b-card border-t border-line bg-paper-2 px-4 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
          {label} · machine-readable
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
          sha-256
        </span>
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-xs leading-none text-navy">
        {chunks.map((c, i) => (
          <span key={i} className="tracking-[0.22em]">
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}
