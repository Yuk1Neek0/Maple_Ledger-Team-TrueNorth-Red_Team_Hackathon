import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import AnomalyList from "../components/AnomalyList.jsx";
import ProvenanceGraph from "../components/ProvenanceGraph.jsx";
import Panel from "../components/ui/Panel.jsx";
import { countryName, designationLabel, formatCad, formatPct } from "../labels.js";

const TABS = ["Supply Chain Graph", "Canadian Content Breakdown", "Anomalies", "Attestations", "Details"];

function Badge({ children, tone = "ok" }) {
  const cls =
    tone === "red"
      ? "bg-tint-red text-red"
      : tone === "ok"
      ? "bg-tint-ok text-ok"
      : "bg-tint-navy text-navy";
  return <span className={`rounded-chip px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

function MetricBlock({ label, value, tone = "navy", helper, chart }) {
  const color = tone === "red" ? "text-red" : tone === "ok" ? "text-ok" : "text-navy";
  return (
    <div className="min-h-[122px] rounded-card border border-line bg-paper p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label}</div>
          <div className={`mt-2 text-3xl font-bold leading-none tracking-tight ${color}`}>{value}</div>
          {helper && <div className="mt-2 text-xs text-ink-3">{helper}</div>}
        </div>
        {chart}
      </div>
    </div>
  );
}

function buildBreakdown(attestations = []) {
  const byCountry = new Map();
  const costType = {
    material: { canadian: 0, nonCanadian: 0 },
    labour: { canadian: 0, nonCanadian: 0 },
  };

  for (const a of attestations) {
    const country = a.performed_in_country || "??";
    const material = Number(a.costs?.material_cad) || 0;
    const labour = Number(a.costs?.labour_cost_cad) || 0;
    const direct = material + labour;
    byCountry.set(country, (byCountry.get(country) || 0) + direct);
    const bucket = country === "CA" ? "canadian" : "nonCanadian";
    costType.material[bucket] += material;
    costType.labour[bucket] += labour;
  }

  const total = [...byCountry.values()].reduce((sum, v) => sum + v, 0);
  return {
    total,
    countries: [...byCountry.entries()]
      .map(([country, cad]) => ({ country, cad, pct: total ? (cad / total) * 100 : 0 }))
      .sort((a, b) => (a.country === "CA" ? -1 : b.country === "CA" ? 1 : b.cad - a.cad)),
    costType,
  };
}

function downloadReport({ result, chain, breakdown }) {
  const report = {
    generated_at: new Date().toISOString(),
    summary: result,
    breakdown,
    submitted_chain: chain,
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${result.product_attestation_id || "verification"}-report.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VerificationResult({ result, chain, graph, cost, onVerifyAnother, onBack }) {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const breakdown = useMemo(() => buildBreakdown(chain?.attestations), [chain]);
  const pass = result.designation !== "none";
  const pct = Math.max(0, Math.min(100, result.canadian_content_percentage || 0));
  const attestations = chain?.attestations || [];
  const suppliers = new Set(attestations.map((a) => a.supplier_id).filter(Boolean)).size;
  const countries = new Set(attestations.map((a) => a.performed_in_country).filter(Boolean)).size;

  const chartData = [
    { name: "Canadian", value: pct, color: "#16884a" },
    { name: "Other", value: Math.max(0, 100 - pct), color: "#dde3ea" },
  ];

  function share() {
    const text = `Maple Ledger verification ${result.product_attestation_id}: ${designationLabel(result.designation)}, ${formatPct(result.canadian_content_percentage)}, chain ${result.chain_valid ? "valid" : "invalid"}.`;
    if (navigator.share) {
      navigator.share({ title: "Maple Ledger verification", text }).catch(() => {});
      return;
    }
    navigator.clipboard?.writeText(text);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="mb-2 text-sm font-semibold text-ink-2 hover:text-navy">
            ← Back to dashboard
          </button>
          <h1 className="text-2xl font-bold text-navy">
            {attestations.find((a) => a.attestation_id === chain?.product_attestation_id)?.output?.name || "Verification Result"}
          </h1>
          <p className="mt-1 font-mono text-xs text-ink-3">
            Product Attestation ID: {chain?.product_attestation_id} · Verified {new Date().toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadReport({ result, chain, breakdown })}
            className="rounded-btn bg-navy px-4 py-2 text-sm font-semibold text-paper"
          >
            Download Report
          </button>
          <button type="button" onClick={share} className="rounded-btn border border-line-2 bg-paper px-4 py-2 text-sm font-semibold text-ink">
            Share
          </button>
          <button type="button" onClick={onVerifyAnother} className="rounded-btn border border-line-2 bg-paper px-4 py-2 text-sm font-semibold text-ink">
            Verify Another
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <MetricBlock
          label="Canadian Content"
          value={formatPct(result.canadian_content_percentage)}
          tone={pass ? "ok" : "red"}
          helper={`${formatCad(cost?.canadianCad || 0)} Canadian of ${formatCad(cost?.totalCad || 0)} total`}
          chart={
            <div className="relative h-20 w-20 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="value" innerRadius={27} outerRadius={38} startAngle={90} endAngle={-270} stroke="none">
                    {chartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          }
        />
        <MetricBlock
          label="Designation"
          value={designationLabel(result.designation)}
          tone={pass ? "ok" : "red"}
          helper={pass ? "Meets threshold and transformation rule" : "Does not qualify under current rules"}
        />
        <MetricBlock
          label="Chain Validity"
          value={result.chain_valid ? "Valid" : "Invalid"}
          tone={result.chain_valid ? "ok" : "red"}
          helper={`${(result.anomalies || []).length} anomalies detected`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Attestations Checked", attestations.length],
          ["Suppliers Involved", suppliers],
          ["Countries Involved", countries],
          ["Anomalies Detected", (result.anomalies || []).length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-card border border-line bg-paper p-4">
            <div className="text-2xl font-bold tabular-nums text-navy">{value}</div>
            <div className="mt-1 text-xs font-semibold text-ink-2">{label}</div>
          </div>
        ))}
      </div>

      <div className="border-b border-line">
        <div className="flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={
                "border-b-2 px-4 py-2 text-sm font-semibold transition " +
                (activeTab === tab ? "border-navy text-navy" : "border-transparent text-ink-2 hover:text-ink")
              }
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "Supply Chain Graph" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          {graph && <ProvenanceGraph graph={graph} height={620} label="supply chain graph" />}
          <Panel label="anomaly panel" accent={(result.anomalies || []).length ? "red" : "ok"}>
            <AnomalyList anomalies={result.anomalies} />
          </Panel>
        </div>
      )}

      {activeTab === "Canadian Content Breakdown" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Panel label="country breakdown" accent="navy" right={`${formatCad(breakdown.total)} total`}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-ink-3">
                  <th className="py-2">Country</th>
                  <th className="py-2 text-right">Direct cost</th>
                  <th className="py-2 text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.countries.map((row) => (
                  <tr key={row.country} className="border-b border-line last:border-b-0">
                    <td className="py-2 font-semibold text-ink">{countryName(row.country)}</td>
                    <td className="py-2 text-right tabular-nums text-ink">{formatCad(row.cad)}</td>
                    <td className="py-2 text-right tabular-nums text-navy">{Math.round(row.pct * 10) / 10}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel label="cost type split" accent="navy">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-ink-3">
                  <th className="py-2">Cost type</th>
                  <th className="py-2 text-right">Canadian</th>
                  <th className="py-2 text-right">Non-Canadian</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Material", breakdown.costType.material],
                  ["Labour", breakdown.costType.labour],
                ].map(([label, row]) => (
                  <tr key={label} className="border-b border-line last:border-b-0">
                    <td className="py-2 font-semibold text-ink">{label}</td>
                    <td className="py-2 text-right tabular-nums text-navy">{formatCad(row.canadian)}</td>
                    <td className="py-2 text-right tabular-nums text-ink-2">{formatCad(row.nonCanadian)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      )}

      {activeTab === "Anomalies" && (
        <Panel label="anomalies" accent={(result.anomalies || []).length ? "red" : "ok"} right={`${(result.anomalies || []).length} findings`}>
          <AnomalyList anomalies={result.anomalies} />
        </Panel>
      )}

      {activeTab === "Attestations" && (
        <Panel label="attestations checked" accent="navy" right={`${attestations.length} records`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-ink-3">
                  <th className="py-2">Attestation ID</th>
                  <th className="py-2">Output</th>
                  <th className="py-2">Supplier</th>
                  <th className="py-2">Country</th>
                  <th className="py-2 text-right">Direct cost</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {attestations.map((a) => {
                  const direct = (Number(a.costs?.material_cad) || 0) + (Number(a.costs?.labour_cost_cad) || 0);
                  const flagged = (result.anomalies || []).some((x) => x.attestation_id === a.attestation_id);
                  return (
                    <tr key={a.attestation_id} className="border-b border-line last:border-b-0">
                      <td className="py-2 font-mono text-xs text-navy">{a.attestation_id}</td>
                      <td className="py-2 text-ink">{a.output?.name || "—"}</td>
                      <td className="py-2 text-ink-2">{a.supplier_id}</td>
                      <td className="py-2 text-ink-2">{a.performed_in_country}</td>
                      <td className="py-2 text-right tabular-nums text-ink">{formatCad(direct)}</td>
                      <td className="py-2"><Badge tone={flagged ? "red" : "ok"}>{flagged ? "flagged" : "valid"}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {activeTab === "Details" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel label="verification response" accent="navy">
            <pre className="overflow-x-auto rounded-btn border border-line bg-paper-2 p-3 font-mono text-xs text-ink">
{JSON.stringify(result, null, 2)}
            </pre>
          </Panel>
          <Panel label="submitted chain summary" accent="navy">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-ink-2">Product attestation</dt><dd className="font-mono text-navy">{chain?.product_attestation_id}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-2">Attestations submitted</dt><dd className="font-semibold text-ink">{attestations.length}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-2">Graph edges</dt><dd className="font-semibold text-ink">{graph?.edges?.length || 0}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-2">Verifier endpoint</dt><dd className="font-mono text-navy">POST /verify</dd></div>
            </dl>
          </Panel>
        </div>
      )}
    </div>
  );
}
