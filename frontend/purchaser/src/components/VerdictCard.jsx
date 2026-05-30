import { designationInfo, formatCents, formatPct } from "../labels.js";
import Panel from "./ui/Panel.jsx";
import Readout from "./ui/Readout.jsx";
import HashStrip from "./ui/HashStrip.jsx";
import CostBreakdown from "./CostBreakdown.jsx";
import AnomalyList from "./AnomalyList.jsx";

// The headline verdict, rendered as an instrument readout: a latched status
// line, the Canadian-content figure as the hero metric, a telemetry summary,
// cost attribution, integrity log, and the root hash as a machine-readable zone.
export default function VerdictCard({ result, rootHash }) {
  const info = designationInfo(result.designation);
  const pass = info.pass;
  const hasHardFailure = (result.anomalies || []).some((a) => !a.advisory);
  const conflicted = pass && hasHardFailure; // pass label + integrity failure
  const tone = pass ? "signal" : "alarm";
  const anomalyCount = (result.anomalies || []).length;

  return (
    <Panel
      label="verdict"
      accent={tone}
      right={result.designation}
      bodyClass="p-0"
      className={pass ? "shadow-[0_0_40px_-22px_var(--color-signal)]" : "shadow-[0_0_40px_-22px_var(--color-alarm)]"}
    >
      {/* latched status header */}
      <div className="latch border-b border-line bg-elevated px-5 py-5">
        <div
          className={`flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] ${
            pass ? "text-signal" : "text-alarm"
          }`}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${pass ? "bg-signal" : "bg-alarm"} blink`} />
          {pass ? "verified" : "does not qualify"}
        </div>
        <div
          className={`mt-2 text-3xl font-semibold leading-none ${
            pass ? "text-signal glow-signal" : "text-alarm glow-alarm"
          }`}
        >
          {info.title}
        </div>
        <p className="prose-sans mt-2 max-w-md text-sm text-dim">{info.blurb}</p>
      </div>

      <div className="space-y-6 p-5">
        {conflicted && (
          <div className="border-l-2 border-alarm bg-alarm/10 px-4 py-3 text-sm text-alarm">
            <strong className="uppercase tracking-wide">⚠ caution</strong> — “{info.title}”
            is asserted but the chain carries an integrity failure below. Treat the label as
            unverified until resolved.
          </div>
        )}

        {/* hero metric */}
        <div className="flex flex-col items-center border border-line bg-base py-6">
          <div className="text-[11px] uppercase tracking-[0.2em] text-dim">
            Canadian content
          </div>
          <div
            className={`mt-1 text-6xl font-semibold tabular-nums ${
              pass ? "text-signal glow-signal" : "text-alarm glow-alarm"
            }`}
          >
            {formatPct(result.canadian_pct)}
          </div>
          <div className="mt-2 text-xs text-dim">
            {formatCents(result.canadian_cost_cents)} CA / {formatCents(result.total_cost_cents)} total
          </div>
        </div>

        {/* telemetry summary */}
        <div className="space-y-1.5">
          <Readout label="designation" value={result.designation} tone={tone} glow />
          <Readout
            label="canadian content"
            value={formatPct(result.canadian_pct)}
            tone={tone}
          />
          <Readout label="ca cost" value={formatCents(result.canadian_cost_cents)} tone="signal" />
          <Readout label="total cost" value={formatCents(result.total_cost_cents)} tone="ink" />
          <Readout
            label="anomalies"
            value={anomalyCount === 0 ? "0 · clean" : String(anomalyCount)}
            tone={anomalyCount === 0 ? "signal" : hasHardFailure ? "alarm" : "amber"}
          />
        </div>

        <section>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cyan">
            Cost origin
          </h3>
          <CostBreakdown
            costByCountry={result.cost_by_country}
            totalCents={result.total_cost_cents}
          />
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cyan">
            Integrity log
          </h3>
          <AnomalyList anomalies={result.anomalies} />
        </section>
      </div>

      {rootHash && <HashStrip hash={rootHash} label="root" />}
    </Panel>
  );
}
