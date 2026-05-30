import Panel from "./Panel.jsx";

// The "authenticating" loading state, rendered as a terminal boot log: status
// lines stream in with a stagger, selling the deterministic verification
// pipeline that runs on the backend.
const LINES = [
  "initializing verifier core",
  "resolving root attestation",
  "walking provenance chain · cycle guard",
  "verifying ed25519 signatures · registry",
  "replay + broken-link precedence pass",
  "mass-balance · cost attribution by country",
  "scoring advisory anomalies",
];

export default function BootSequence({ rootHash }) {
  const short = rootHash ? String(rootHash).slice(0, 24) : "—";
  return (
    <Panel label="verify" accent="cyan" right="working" bodyClass="p-4">
      <div className="font-mono text-[13px] leading-relaxed">
        {LINES.map((line, i) => (
          <div
            key={i}
            className="line-in flex items-center gap-2 text-dim"
            style={{ animationDelay: `${i * 0.14}s` }}
          >
            <span className="text-signal">›</span>
            <span>{line}</span>
            <span className="text-faint">…</span>
            <span
              className="ml-auto text-signal/80"
              style={{ animationDelay: `${i * 0.14 + 0.1}s` }}
            >
              ok
            </span>
          </div>
        ))}
        <div
          className="line-in mt-3 flex items-center gap-2 text-cyan"
          style={{ animationDelay: `${LINES.length * 0.14}s` }}
        >
          <span>›</span>
          <span className="truncate">authenticating {short}</span>
          <span className="blink">█</span>
        </div>
      </div>
    </Panel>
  );
}
