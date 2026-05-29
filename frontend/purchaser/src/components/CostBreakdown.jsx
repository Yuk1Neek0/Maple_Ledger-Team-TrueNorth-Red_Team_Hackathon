import { countryName, formatCents } from "../labels.js";

// Stacked bar + per-country rows for cost_by_country. CA is highlighted in red
// (the Canadian content); everything else is muted grey.
export default function CostBreakdown({ costByCountry, totalCents }) {
  const entries = Object.entries(costByCountry || {}).sort(
    (a, b) => b[1] - a[1]
  );
  const total =
    typeof totalCents === "number" && totalCents > 0
      ? totalCents
      : entries.reduce((sum, [, c]) => sum + c, 0);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-slate-500">No cost breakdown available.</p>
    );
  }

  return (
    <div>
      {/* Single stacked bar */}
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
        {entries.map(([code, cents]) => {
          const pct = total > 0 ? (cents / total) * 100 : 0;
          const isCa = code === "CA";
          return (
            <div
              key={code}
              title={`${countryName(code)}: ${formatCents(cents)} (${pct.toFixed(
                1
              )}%)`}
              style={{ width: `${pct}%` }}
              className={isCa ? "bg-red-500" : "bg-slate-400"}
            />
          );
        })}
      </div>

      {/* Per-country rows */}
      <ul className="mt-3 space-y-1.5">
        {entries.map(([code, cents]) => {
          const pct = total > 0 ? (cents / total) * 100 : 0;
          const isCa = code === "CA";
          return (
            <li
              key={code}
              className="flex items-center justify-between text-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-sm ${
                    isCa ? "bg-red-500" : "bg-slate-400"
                  }`}
                />
                <span
                  className={
                    isCa ? "font-medium text-slate-800" : "text-slate-600"
                  }
                >
                  {countryName(code)}
                </span>
              </span>
              <span className="tabular-nums text-slate-600">
                {formatCents(cents)}{" "}
                <span className="text-slate-400">({pct.toFixed(1)}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
