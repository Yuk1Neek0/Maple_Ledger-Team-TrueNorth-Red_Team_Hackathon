import { countryName, formatCents } from "../labels.js";

// Cost attribution by country, control-room style: a single segmented signal
// bar (CA = phosphor green, foreign = cycled cool tones) plus telemetry rows.
const FOREIGN = ["#46d6f0", "#f5b13d", "#7e8e9a", "#9a6cf0", "#4d5a66"];

export default function CostBreakdown({ costByCountry, totalCents }) {
  const entries = Object.entries(costByCountry || {}).sort((a, b) => b[1] - a[1]);
  const total =
    typeof totalCents === "number" && totalCents > 0
      ? totalCents
      : entries.reduce((sum, [, c]) => sum + c, 0);

  if (entries.length === 0) {
    return <p className="text-sm text-dim">No cost breakdown available.</p>;
  }

  let f = 0;
  const colored = entries.map(([code, cents]) => ({
    code,
    cents,
    color: code === "CA" ? "var(--color-signal)" : FOREIGN[f++ % FOREIGN.length],
  }));

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden border border-line bg-base">
        {colored.map(({ code, cents, color }) => {
          const pct = total > 0 ? (cents / total) * 100 : 0;
          return (
            <div
              key={code}
              title={`${countryName(code)}: ${formatCents(cents)} (${pct.toFixed(1)}%)`}
              style={{ width: `${pct}%`, backgroundColor: color }}
              className={code === "CA" ? "glow-signal" : ""}
            />
          );
        })}
      </div>

      <ul className="mt-3 space-y-1.5">
        {colored.map(({ code, cents, color }) => {
          const pct = total > 0 ? (cents / total) * 100 : 0;
          const isCa = code === "CA";
          return (
            <li key={code} className="leader text-sm">
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5"
                  style={{ backgroundColor: color }}
                />
                <span className={isCa ? "font-medium text-signal" : "text-dim"}>
                  {countryName(code)}
                </span>
                {isCa && (
                  <span className="text-[10px] uppercase tracking-[0.14em] text-signal/70">
                    domestic
                  </span>
                )}
              </span>
              <span className="leader-fill" aria-hidden />
              <span className="tabular-nums text-ink">
                {formatCents(cents)}{" "}
                <span className="text-faint">({pct.toFixed(1)}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
