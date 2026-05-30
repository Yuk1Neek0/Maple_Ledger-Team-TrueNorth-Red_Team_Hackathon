import Panel from "../components/ui/Panel.jsx";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

const METRICS = [
  ["42", "Signed Attestations", "Issued this program"],
  ["8", "Pending Drafts", "Ready for review"],
  ["12", "Products Supplied", "Across active chains"],
  ["0", "Verification Issues", "No open blockers", "ok"],
  ["E2A5519", "Key Verified", "Ed25519 registry key"],
];

const ACTIVITY = [
  ["Signed attestation", "Drone Recon Kit final integration", "10:24 AM"],
  ["Added parent input", "Carbon Fibre Sheet", "Yesterday"],
  ["Verified preview", "Sensor Module chain confirmed", "Yesterday"],
  ["Draft requires review", "Motor Controller cost fields", "May 28"],
];

const PRODUCTS = [
  ["Drone Recon Kit", "att-anchor-0012", "made_in_canada"],
  ["Parachute Recovery Assembly", "att-anchor-0005", "made_in_canada"],
  ["Sensor Module", "att-sensor-014", "preview clean"],
];

const TYPE_DATA = [
  { name: "Raw Material Supply", value: 9, color: "#16884a" },
  { name: "Component Manufacture", value: 16, color: "#26374a" },
  { name: "Subassembly", value: 11, color: "#9aa0a6" },
  { name: "Final Integration", value: 6, color: "#cdd2d7" },
];

function MetricCard({ value, label, helper, tone = "navy" }) {
  return (
    <div className="min-h-[86px] rounded-card border border-line bg-paper p-4">
      <div className={`text-2xl font-bold tabular-nums ${tone === "ok" ? "text-ok" : "text-navy"}`}>
        {value}
      </div>
      <div className="mt-1 text-[13px] font-semibold text-ink">{label}</div>
      <div className="mt-0.5 text-[11px] text-ink-3">{helper}</div>
    </div>
  );
}

function Badge({ children, tone = "ok" }) {
  const cls = tone === "ok" ? "bg-tint-ok text-ok" : "bg-tint-navy text-navy";
  return <span className={`rounded-chip px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

export default function SupplierDashboard({ onCreate }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-2">
            Operating view for signed attestations, drafts, product coverage, and key health.
          </p>
        </div>
        <button type="button" onClick={onCreate} className="rounded-btn bg-navy px-4 py-2 text-sm font-semibold text-paper">
          + Create Attestation
        </button>
      </div>

      <div className="grid items-stretch gap-4 md:grid-cols-5">
        {METRICS.map(([value, label, helper, tone]) => (
          <MetricCard key={label} value={value} label={label} helper={helper} tone={tone} />
        ))}
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <Panel label="recent activity" accent="navy">
          <div className="space-y-3">
            {ACTIVITY.map(([type, text, time]) => (
              <div key={`${type}-${text}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-line pb-2 last:border-b-0 last:pb-0">
                <span className="h-2.5 w-2.5 rounded-full bg-ok" aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">{type}</div>
                  <div className="truncate text-xs text-ink-2">{text}</div>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">{time}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel label="attestations by type" accent="navy">
          <div className="grid min-h-[150px] grid-cols-[150px_minmax(0,1fr)] items-center gap-4">
            <div className="relative h-[140px] w-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={TYPE_DATA}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={43}
                    outerRadius={63}
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                  >
                    {TYPE_DATA.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <div className="text-lg font-bold leading-none text-navy">42</div>
                  <div className="mt-1 text-[10px] text-ink-3">signed</div>
                </div>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {TYPE_DATA.map((item) => (
                <div key={item.name} className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
                  <span className="min-w-0 truncate text-ink-2">{item.name}</span>
                  <span className="font-semibold tabular-nums text-ink">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel label="top products" accent="navy">
          <div className="space-y-3">
            {PRODUCTS.map(([name, id, status]) => (
              <div key={id} className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-b-0 last:pb-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{name}</div>
                  <div className="truncate font-mono text-[10px] text-ink-3">{id}</div>
                </div>
                <Badge tone={status.includes("made") ? "ok" : "navy"}>{status}</Badge>
              </div>
            ))}
          </div>
        </Panel>

        <Panel label="verification status" accent="navy">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-ink-2">Valid 42 · Warning 0 · Invalid 0</span>
            <span className="font-semibold text-ok">100%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-paper-2">
            <div className="h-full w-full rounded-full bg-ok" />
          </div>
          <p className="mt-3 text-xs text-ink-3">
            The create flow signs locally and submits a single-node preview to the current /verify backend.
          </p>
        </Panel>
      </div>
    </div>
  );
}
