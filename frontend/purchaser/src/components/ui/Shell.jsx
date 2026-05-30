// Shell — the shared Maple Ledger workspace chrome (sidebar + topbar + footer).
// Duplicated verbatim in the supplier and purchaser apps; each passes its own
// `active` workspace key and topbar `context` label.
//
// Each console is a SEPARATE app on its own port, so the sidebar is framed as
// "you are here + switch workspace" rather than in-app routing: the active
// console is marked current (not a link), the others are real cross-app links,
// and Auditor is a disabled placeholder (no app yet).
const WORKSPACES = [
  { key: "supplier", label: "Supplier", role: "Issue attestations", href: "http://localhost:5173/" },
  { key: "purchaser", label: "Purchaser", role: "Verify origin", href: "http://localhost:5174/" },
  { key: "auditor", label: "Auditor", role: "Walk the chain", href: null },
];

const TEAM = ["Ashton (Zhengshen) Shu", "Sikai Han", "Laxman KC"];
const IDENTITY = "Ashton (Zhengshen) Shu · Team TrueNorth";

function WorkspaceItem({ item, active }) {
  const isActive = item.key === active;

  // Current workspace — "you are here", not a link.
  if (isActive) {
    return (
      <div
        aria-current="page"
        className="flex items-center gap-2.5 border-l-[3px] border-navy bg-tint-navy px-4 py-2.5"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-navy">{item.label}</div>
          <div className="truncate text-[11px] text-ink-2">{item.role}</div>
        </div>
        <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-navy" aria-hidden />
      </div>
    );
  }

  // Not yet built — disabled placeholder.
  if (!item.href) {
    return (
      <div
        className="flex cursor-not-allowed items-center gap-2.5 border-l-[3px] border-transparent px-4 py-2.5 opacity-60"
        title="Coming soon"
      >
        <div className="min-w-0">
          <div className="text-sm text-ink-3">{item.label}</div>
          <div className="truncate text-[11px] text-ink-3">{item.role}</div>
        </div>
        <span className="ml-auto shrink-0 rounded-chip bg-tint-navy px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-3">
          soon
        </span>
      </div>
    );
  }

  // Another live console — a real cross-app link.
  return (
    <a
      href={item.href}
      className="group flex items-center gap-2.5 border-l-[3px] border-transparent px-4 py-2.5 transition hover:bg-paper-2"
      title={`Open the ${item.label} workspace`}
    >
      <div className="min-w-0">
        <div className="text-sm text-ink group-hover:text-navy">{item.label}</div>
        <div className="truncate text-[11px] text-ink-3">{item.role}</div>
      </div>
      <span className="ml-auto shrink-0 text-ink-3 group-hover:text-navy" aria-hidden>
        ↗
      </span>
    </a>
  );
}

export default function Shell({ active, context, children, backend }) {
  return (
    <div className="flex h-full min-h-full bg-paper-2">
      {/* Sidebar */}
      <aside className="flex w-[214px] shrink-0 flex-col border-r border-line-2 bg-paper">
        <div className="px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red" aria-hidden />
            <span className="text-[15px] font-semibold tracking-tight text-navy">
              Maple Ledger
            </span>
          </div>
          <div className="mt-1 pl-4 text-[11px] text-ink-3">Provenance for Canadian supply chains</div>
        </div>

        <div className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">
          Workspace
        </div>
        <nav className="flex flex-col">
          {WORKSPACES.map((item) => (
            <WorkspaceItem key={item.key} item={item} active={active} />
          ))}
        </nav>

        <div className="mt-auto px-4 py-3">
          {backend && (
            <div className="mb-3 flex items-center gap-1.5 border-t border-line pt-3 font-mono text-[10px] uppercase tracking-wider text-ink-3">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
              {backend}
            </div>
          )}
          <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-ink-3">
            Team TrueNorth
          </div>
          {TEAM.map((name) => (
            <div key={name} className="text-[11px] leading-relaxed text-ink-2">
              {name}
            </div>
          ))}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[54px] shrink-0 items-center justify-between border-b border-line-2 bg-paper px-6">
          <span className="font-mono text-xs uppercase tracking-wider text-ink-2">
            {context}
          </span>
          <span className="text-xs text-ink-2">{IDENTITY}</span>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">{children}</main>

        <footer className="shrink-0 border-t border-line bg-paper px-6 py-2 text-center font-mono text-[11px] uppercase tracking-wider text-ink-3">
          Mock data shown
        </footer>
      </div>
    </div>
  );
}
