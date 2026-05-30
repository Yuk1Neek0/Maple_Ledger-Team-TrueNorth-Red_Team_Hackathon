import Panel from "../components/ui/Panel.jsx";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

const METRICS = [
  ["56", "Products Verified", "Mock operating snapshot", "navy"],
  ["52", "Valid Chains", "Live verifier compatible", "ok"],
  ["2", "Invalid Chains", "Require review", "red"],
  ["18", "Made in Canada", "51% threshold", "ok"],
  ["21", "Product of Canada", "98% threshold", "ok"],
];

const RECENT = [
  ["Drone Recon Kit", "att-anchor-0012", "made_in_canada", "valid"],
  ["Parachute Recovery Assembly", "att-anchor-0005", "made_in_canada", "valid"],
  ["Tampered Demo Chain", "att-anchor-0012", "none", "invalid"],
];

const RISK_DATA = [
  { name: "Low Risk", value: 32, color: "#16884a" },
  { name: "Medium Risk", value: 3, color: "#26374a" },
  { name: "High Risk", value: 1, color: "#d52b1e" },
];

function MetricCard({ value, label, helper, tone = "navy" }) {
  const valueClass =
    tone === "red" ? "text-red" : tone === "ok" ? "text-ok" : "text-navy";
  return (
    <div className="min-h-[84px] rounded-card border border-line bg-paper p-4">
      <div className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</div>
      <div className="mt-1 text-[13px] font-semibold text-ink">{label}</div>
      <div className="mt-0.5 text-[11px] text-ink-3">{helper}</div>
    </div>
  );
}

function Badge({ children, tone = "ok" }) {
  const cls =
    tone === "red"
      ? "bg-tint-red text-red"
      : tone === "ok"
      ? "bg-tint-ok text-ok"
      : "bg-paper-2 text-ink-2";
  return (
    <span className={`rounded-chip px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

export default function PurchaserDashboard({ onVerifyProduct }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-2">
            Verification command center with live /verify checks and mock portfolio context.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onVerifyProduct} className="rounded-btn border border-line-2 bg-paper px-4 py-2 text-sm font-semibold text-ink">
            Scan QR Code
          </button>
          <button type="button" onClick={onVerifyProduct} className="rounded-btn bg-navy px-4 py-2 text-sm font-semibold text-paper">
            + Verify Product
          </button>
        </div>
      </div>

      <div className="grid items-stretch gap-4 md:grid-cols-5">
        {METRICS.map(([value, label, helper, tone]) => (
          <MetricCard key={label} value={value} label={label} helper={helper} tone={tone} />
        ))}
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.75fr)]">
        <div className="space-y-5">
          <Panel label="recent verifications" accent="navy" right="mock history">
            <div className="space-y-3">
              {RECENT.map(([name, id, designation, validity]) => (
                <div key={`${id}-${name}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-line pb-2 last:border-b-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{name}</div>
                    <div className="truncate font-mono text-[10px] text-ink-3">{id}</div>
                  </div>
                  <Badge tone={designation === "none" ? "red" : "ok"}>{designation}</Badge>
                  <Badge tone={validity === "invalid" ? "red" : "ok"}>{validity}</Badge>
                </div>
              ))}
            </div>
          </Panel>

          <Panel label="backend api status" accent="navy" right="current implementation">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="text-ink-2">Live verification</span>
                <Badge>POST /verify</Badge>
              </div>
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="text-ink-2">Input methods</span>
                <Badge>QR / JSON / demo chain</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-2">Result views</span>
                <Badge>verdict / graph / anomalies</Badge>
              </div>
            </div>
          </Panel>

        </div>

        <div className="space-y-5">
          <Panel label="supplier risk overview" accent="navy" right="mock portfolio">
            <div className="grid min-h-[150px] grid-cols-[150px_minmax(0,1fr)] items-center gap-4">
              <div className="relative h-[140px] w-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={RISK_DATA}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={43}
                      outerRadius={63}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      {RISK_DATA.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className="text-2xl font-bold leading-none text-ok">92%</div>
                    <div className="mt-1 text-[11px] font-semibold text-ok">Low Risk</div>
                  </div>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {RISK_DATA.map((item) => (
                  <div key={item.name} className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
                    <span className="min-w-0 truncate text-ink-2">{item.name}</span>
                    <span className="font-semibold tabular-nums text-ink">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel label="policy compliance" accent="navy" right="mock portfolio">
            <div className="space-y-3 text-sm">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-ink-2">Buy Canadian</span>
                  <span className="font-semibold text-ok">86%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-paper-2">
                  <div className="h-full w-[86%] rounded-full bg-ok" />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-ink-2">Product of Canada</span>
                  <span className="font-semibold text-ok">38%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-paper-2">
                  <div className="h-full w-[38%] rounded-full bg-ok" />
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
