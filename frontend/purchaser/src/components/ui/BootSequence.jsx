import Panel from "./Panel.jsx";

// The "verifying" loading state. A concise, light-mode checklist of the
// deterministic verification pipeline running on the backend — no terminal
// theatrics, just the steps with a working indicator.
const LINES = [
  "Resolving root attestation",
  "Walking provenance chain (cycle guard)",
  "Verifying Ed25519 signatures against registry",
  "Replay + broken-link precedence pass",
  "Mass-balance · cost attribution by country",
  "Scoring advisory anomalies",
];

export default function BootSequence({ rootHash }) {
  const short = rootHash ? String(rootHash).slice(0, 24) : "—";
  return (
    <Panel label="verifying" accent="navy" right="working" bodyClass="p-4">
      <ul className="space-y-2 text-sm text-ink-2">
        {LINES.map((line, i) => (
          <li key={i} className="flex items-center gap-2.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 font-mono text-xs text-navy">
        <span
          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-2 border-t-navy"
          aria-hidden
        />
        <span className="truncate">authenticating {short}</span>
      </div>
    </Panel>
  );
}
