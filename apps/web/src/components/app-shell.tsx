import Link from "next/link";
import { CommandMenu } from "@/components/command-menu";
import { StatusDot } from "@/components/ui/status-dot";

const NAV = [
  { href: "/", label: "Control Center", scope: "super-admin" },
  { href: "/clients/acme", label: "Client Dashboard", scope: "client" },
];

/**
 * Persistent application shell: monochromatic sidebar + top command bar.
 * Both the Super-Admin and white-labeled Client surfaces render inside this.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-surface-base">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border-subtle bg-surface-raised md:flex">
        <div className="flex h-14 items-center gap-2 px-4">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-content-primary font-mono text-xs font-bold text-surface-base">
            P
          </div>
          <span className="text-sm font-semibold tracking-tight">Praxarch</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-overlay hover:text-content-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border-subtle p-3">
          <div className="flex items-center justify-between text-xs text-content-muted">
            <span>Platform</span>
            <StatusDot status="active" withLabel label="Operational" />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-border-subtle bg-surface-raised px-4">
          <CommandMenu />
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-content-muted sm:inline">platform-ops@praxarch</span>
            <div className="h-7 w-7 rounded-full border border-border-subtle bg-surface-overlay" />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
