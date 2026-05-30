// CostBreakdown: a compact cost-by-country view — a single stacked bar plus a
// per-country legend with dollar amounts. Canadian value is navy; foreign value
// is red (the only place red appears in the cost view). Reads from the
// locally-derived cost object.

import { countryName, formatCad } from "../labels.js";

// Foreign-origin shades (reds/greys) — CA is always navy.
const FOREIGN = ["#d52b1e", "#b4554e", "#9aa0a6", "#5c6670", "#cdd2d7"];

export default function CostBreakdown({ cost }) {
  const total = cost?.totalCad || 0;
  const byCountry = cost?.byCountry || {};
  const entries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]);
  if (total <= 0 || entries.length === 0) {
    return null;
  }

  // CA first, then the rest by descending value.
  entries.sort((a, b) => (a[0] === "CA" ? -1 : b[0] === "CA" ? 1 : b[1] - a[1]));

  let foreignIdx = 0;
  const segs = entries.map(([country, cad]) => {
    const pct = (cad / total) * 100;
    const color = country === "CA" ? "var(--color-navy)" : FOREIGN[foreignIdx++ % FOREIGN.length];
    return { country, cad, pct, color };
  });

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-ink-3">
        <span>cost by country</span>
        <span className="tabular-nums">{formatCad(total)} total</span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-line">
        {segs.map((s) => (
          <div
            key={s.country}
            style={{ width: `${s.pct}%`, backgroundColor: s.color }}
            title={`${countryName(s.country)} · ${formatCad(s.cad)}`}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1">
        {segs.map((s) => (
          <li key={s.country} className="flex items-center gap-2 text-sm">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-ink">{countryName(s.country)}</span>
            <span className="leader-fill" aria-hidden />
            <span className={"tabular-nums " + (s.country === "CA" ? "text-navy" : "text-ink-2")}>
              {formatCad(s.cad)}
            </span>
            <span className="tabular-nums text-ink-3">· {Math.round(s.pct)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
