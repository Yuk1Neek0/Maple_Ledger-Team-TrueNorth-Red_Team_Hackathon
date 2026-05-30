// Shell — Maple Ledger product chrome.
// Only working destinations are shown; future /api/v1 product screens stay hidden
// until the backend routes exist.
const WORKSPACE_LABELS = {
  supplier: "Supplier",
  purchaser: "Purchaser / Verifier",
};

const HEADER_THEMES = {
  supplier: {
    className: "bg-navy",
    eyebrow: "text-paper/80",
    meta: "text-paper/80",
    accent: "bg-red",
  },
  purchaser: {
    className: "bg-ok",
    eyebrow: "text-paper/85",
    meta: "text-paper/85",
    accent: "bg-navy",
  },
};

const NAV = {
  supplier: [
    { label: "Dashboard", href: "/", note: "Supplier operating dashboard" },
    { label: "Create Attestation", href: "#create-attestation", note: "Sign locally and preview through /verify" },
  ],
  purchaser: [
    { label: "Dashboard", href: "/", note: "Verification command center" },
    { label: "Verify Product", href: "#verify-product", note: "POST /verify" },
  ],
};

const TEAM = "Maple Ledger";

const PROFILE = {
  supplier: {
    org: "Maple Robotics Components Ltd.",
    badge: "Verified Supplier",
    name: "Alex Morgan",
    role: "Supplier Admin",
  },
  purchaser: {
    org: "Defence Procurement Agency Canada",
    badge: "Verified Purchaser",
    name: "Taylor Chen",
    role: "Procurement Officer",
  },
};

function NavItem({ item, active }) {
  return (
    <a
      href={item.href}
      title={item.note}
      className={
        "block w-full rounded-btn px-3 py-2 text-left text-[13px] font-medium transition " +
        (active
          ? "bg-tint-navy text-navy"
          : "text-ink-2 hover:bg-paper-2 hover:text-ink")
      }
    >
      {item.label}
    </a>
  );
}

export default function Shell({
  active,
  context,
  subtitle,
  children,
  backend,
  dataMode = "Live /verify backend",
  activeNav,
  dense = false,
}) {
  const nav = NAV[active] || [];
  const workspace = WORKSPACE_LABELS[active] || "Maple Ledger";
  const current = activeNav || nav[0]?.label;
  const profile = PROFILE[active] || PROFILE.purchaser;
  const header = HEADER_THEMES[active] || HEADER_THEMES.supplier;

  return (
    <div className="flex h-full min-h-full flex-col bg-paper-2">
      <header className={`flex h-[52px] shrink-0 items-center justify-between px-5 text-paper ${header.className}`}>
        <div className="min-w-0">
          <div className={`font-mono text-[11px] font-semibold uppercase tracking-wider ${header.eyebrow}`}>
            Maple Ledger · {workspace} · {context}
          </div>
          {subtitle && <div className="truncate text-sm font-semibold text-paper">{subtitle}</div>}
        </div>
        <div className={`hidden text-right text-xs ${header.meta} sm:block`}>
          {TEAM}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-52 shrink-0 flex-col border-r border-line bg-paper px-4 py-4">
          <div className="mb-6">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${header.accent}`} aria-hidden />
              <div className="min-w-0">
                <div className="text-[16px] font-bold leading-tight tracking-tight text-navy">
                  Maple Ledger
                </div>
                <div className="text-[11px] font-medium text-ink-3">{workspace}</div>
              </div>
            </div>

            <div className="mt-4 rounded-card border border-line bg-paper-2 px-3 py-3">
              <div className="truncate text-[12px] font-semibold leading-tight text-ink">{profile.org}</div>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-chip bg-tint-ok px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ok">
                <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden /> {profile.badge}
              </div>
            </div>
          </div>

          <div className="mb-2 px-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            Navigation
          </div>
          <nav className="space-y-1" aria-label={`${workspace} navigation`}>
            {nav.map((item) => (
              <NavItem key={item.label} item={item} active={item.label === current} />
            ))}
          </nav>

          <div className="mt-auto border-t border-line pt-3">
            {backend && (
              <div className="mb-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-3">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
                {backend}
              </div>
            )}
            <div className="rounded-card border border-line bg-paper-2 px-3 py-3">
              <div className="truncate text-[12px] font-semibold text-ink">{profile.name}</div>
              <div className="mt-0.5 text-[11px] text-ink-3">{profile.role}</div>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">{dataMode}</div>
            </div>
          </div>
        </aside>

        <main className={"min-w-0 flex-1 overflow-auto " + (dense ? "bg-paper" : "bg-paper-2")}>
          {children}
        </main>
      </div>
    </div>
  );
}
