// VerdictCard: the headline result — the designation, the Canadian-content
// metric, the cost split, and any anomalies. The buyer's at-a-glance
// "is this really Canadian?" panel.

import Panel from "./ui/Panel.jsx";
import Readout from "./ui/Readout.jsx";
import HashStrip from "./ui/HashStrip.jsx";
import CostBreakdown from "./CostBreakdown.jsx";
import AnomalyList from "./AnomalyList.jsx";
import {
  designationLabel,
  formatPct,
} from "../labels.js";

export default function VerdictCard({ result, cost, productId }) {
  const pass = result.designation !== "none";
  // Key numbers are navy; a non-qualifying verdict reads red.
  const headlineText = pass ? "text-navy" : "text-red";
  const barColor = pass ? "bg-navy" : "bg-red";
  const pct = Math.min(100, Math.max(0, result.canadian_content_percentage || 0));

  return (
    <Panel
      label="designation"
      accent={pass ? "navy" : "red"}
      right={pass ? "qualified" : "not qualified"}
    >
      <div>
        {/* Designation headline */}
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">designation</div>
            <div className={`mt-1 text-2xl font-bold tracking-tight ${headlineText}`}>
              {designationLabel(result.designation)}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">ca content</div>
            <div className={`mt-1 text-3xl font-bold tabular-nums ${headlineText}`}>
              {formatPct(result.canadian_content_percentage)}
            </div>
          </div>
        </div>

        {/* Canadian-content bar */}
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Cost split — derived locally; only the headline % is from the verifier */}
        {cost && (
          <div className="mt-5">
            <CostBreakdown cost={cost} />
            <p className="mt-2 text-[11px] text-ink-3">
              Dollar split derived locally from the submitted chain. The verifier returns the
              percentage above, not the per-country amounts.
            </p>
          </div>
        )}

        {/* Readouts */}
        <div className="mt-5 space-y-1.5">
          <Readout label="product id" value={productId || "—"} mono />
          <Readout
            label="chain integrity"
            value={result.chain_valid ? "intact" : "compromised"}
            tone={result.chain_valid ? "ok" : "red"}
          />
          <Readout
            label="anomalies"
            value={(result.anomalies || []).length}
            tone={(result.anomalies || []).length ? "red" : "ok"}
          />
        </div>

        {/* Anomalies */}
        {(result.anomalies || []).length > 0 && (
          <div className="mt-5">
            <AnomalyList anomalies={result.anomalies} />
          </div>
        )}
      </div>

      {productId && <HashStrip hash={productId} label="product" />}
    </Panel>
  );
}
