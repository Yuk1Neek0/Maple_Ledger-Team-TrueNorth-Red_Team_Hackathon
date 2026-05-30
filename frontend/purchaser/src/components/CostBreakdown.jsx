import { countryName, formatCad } from "../labels.js";

// Cost attribution by country, control-room style: a single segmented signal
// bar (CA = phosphor green, foreign = cycled cool tones) plus telemetry rows.
// Amounts are CAD dollars (the real wire unit), derived locally from the chain.
const FOREIGN = ["#46d6f0", "#f5b13d", "#7e8e9a", "#9a6cf0", "#4d5a66"];

export default function CostBreakdown({ byCountry, totalCad }) {
  const entries = Object.entries(byCountry || {}).sort((a, b) => b[1] - a[1]);
  const total =
    typeof totalCad === "number" && totalCad > 0
      ? totalCad
      : entries.reduce((sum, [, c]) => sum + c, 0);

  if (entries.length === 0) {
    return <p className="text-sm text-dim">No cost breakdown available.</p>;
  }

  let f = 0;
  const colored = entries.map(([code, cad]) => ({
    code,
    cad,
    color: code === "CA" ? "var(--color-signal)" : FOREIGN[f++ % FOREIGN.length],
  }));

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden border border-line bg-base">
        {colored.map(({ code, cad, color }) => {
          const pct = total > 0 ? (cad / total) * 100 : 0;
          return (
            <div
              key={code}
              title={`${countryName(code)}: ${formatCad(cad)} (${pct.toFixed(1)}%)`}
              style={{ width: `${pct}%`, backgroundColor: color }}
              className={code === "CA" ? "glow-signal" : ""}
            />
          );
        })}
      </div>

      <ul className="mt-3 space-y-1.5">
        {colored.map(({ code, cad, color }) => {
          const pct = total > 0 ? (cad / total) * 100 : 0;
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
                {formatCad(cad)}{" "}
                <span className="text-faint">({pct.toFixed(1)}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
