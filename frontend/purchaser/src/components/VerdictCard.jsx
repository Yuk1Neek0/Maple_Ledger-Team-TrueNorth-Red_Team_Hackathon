import { designationInfo, formatCents, formatPct } from "../labels.js";
import CostBreakdown from "./CostBreakdown.jsx";
import AnomalyList from "./AnomalyList.jsx";

// The headline result a purchaser reads: a big pass/fail badge, the Canadian
// content %, the cost-by-country breakdown and any integrity anomalies.
export default function VerdictCard({ result, rootHash }) {
  const info = designationInfo(result.designation);
  const pass = info.pass;
  const hasHardFailure = (result.anomalies || []).some((a) => !a.advisory);

  // A pass designation with a hard integrity failure is contradictory — warn.
  const conflicted = pass && hasHardFailure;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Badge header */}
      <div
        className={`px-6 py-7 text-center ${
          pass ? "bg-emerald-600" : "bg-red-600"
        }`}
      >
        <div className="text-xs font-semibold uppercase tracking-widest text-white/80">
          {pass ? "Verified" : "Does not qualify"}
        </div>
        <div className="mt-1 flex items-center justify-center gap-2 text-3xl font-extrabold text-white">
          <span aria-hidden>{pass ? "🍁" : "✕"}</span>
          <span>{info.title}</span>
        </div>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/90">
          {info.blurb}
        </p>
      </div>

      <div className="space-y-6 p-6">
        {conflicted && (
          <div className="rounded-xl border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
            <strong>Caution:</strong> this product carries a “{info.title}”
            label but the chain has an integrity failure below. Treat the label
            as unverified until the failure is resolved.
          </div>
        )}

        {/* Canadian content % — the hero number */}
        <div className="flex flex-col items-center gap-1">
          <div className="text-sm font-medium text-slate-500">
            Canadian content
          </div>
          <div
            className={`text-5xl font-extrabold tabular-nums ${
              pass ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {formatPct(result.canadian_pct)}
          </div>
          <div className="text-sm text-slate-500">
            {formatCents(result.canadian_cost_cents)} Canadian of{" "}
            {formatCents(result.total_cost_cents)} total
          </div>
        </div>

        {/* Cost-by-country */}
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Where the cost comes from
          </h3>
          <CostBreakdown
            costByCountry={result.cost_by_country}
            totalCents={result.total_cost_cents}
          />
        </section>

        {/* Anomalies */}
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Integrity check
          </h3>
          <AnomalyList anomalies={result.anomalies} />
        </section>

        {rootHash && (
          <p className="border-t border-slate-100 pt-3 font-mono text-xs text-slate-400">
            root: {rootHash}
          </p>
        )}
      </div>
    </div>
  );
}
