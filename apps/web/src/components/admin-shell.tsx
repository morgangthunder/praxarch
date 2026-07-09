"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Workflow,
  ScrollText,
  Brain,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import { CommandMenu } from "@/components/command-menu";
import { AssistantProvider } from "@/components/assistant/assistant-context";
import { AssistantLauncher, AssistantPanel } from "@/components/assistant/assistant-panel";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";

interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Control Center", icon: LayoutDashboard },
  { href: "/admin/tenants", label: "Tenants", icon: Building2 },
  { href: "/admin/flows", label: "Flow Studio", icon: Workflow },
  { href: "/admin/ai-models", label: "AI Models", icon: Brain },
  { href: "/admin/prompts", label: "Prompt Registry", icon: ScrollText },
];

/**
 * Super-Admin shell. This entire surface is platform-operator only and is
 * never exposed to tenants. Distinguished from the tenant app by the amber
 * "Admin" badge and the global tooling nav.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // The workspace the operator was last viewing, so they can jump straight back.
  const [active, setActive] = useState<{ slug: string; name: string }>({
    slug: "acme",
    name: "the workspace",
  });
  useEffect(() => {
    const raw = window.localStorage.getItem("praxarch_active_tenant");
    if (raw) {
      try {
        setActive(JSON.parse(raw));
      } catch {
        /* ignore malformed value */
      }
    }
  }, []);

  return (
    <AssistantProvider tenantSlug={active.slug}>
    <div className="flex min-h-screen bg-surface-base">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border-subtle bg-surface-raised md:flex">
        <div className="flex h-14 items-center gap-2 px-4">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-content-primary font-mono text-xs font-bold text-surface-base">
            P
          </div>
          <span className="text-sm font-semibold tracking-tight">Praxarch</span>
          <span className="ml-auto rounded border border-status-pending/40 bg-status-pending/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-status-pending">
            Admin
          </span>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {ADMIN_NAV.map((item) => {
            const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-surface-overlay text-content-primary"
                    : "text-content-secondary hover:bg-surface-overlay hover:text-content-primary"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-border-subtle p-3">
          <Link
            href={`/app/${active.slug}/overview`}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-content-secondary transition-colors hover:bg-surface-overlay hover:text-content-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to {active.name}
          </Link>
          <div className="flex items-center justify-between px-1 text-xs text-content-muted">
            <span>Platform</span>
            <StatusDot status="active" withLabel label="Operational" />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-border-subtle bg-surface-raised px-4">
          <div className="flex items-center gap-3">
            <CommandMenu />
            <Link
              href={`/app/${active.slug}/overview`}
              className="hidden items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-base px-2.5 py-1.5 text-xs text-content-muted transition-colors hover:border-border-strong hover:text-content-secondary md:inline-flex"
            >
              <span className="text-content-muted">Viewing:</span>
              <span className="font-medium text-content-secondary">{active.name}</span>
              <ArrowLeft className="h-3 w-3 rotate-180" />
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <AssistantLauncher />
            <span className="hidden text-xs text-content-muted sm:inline">platform-ops@praxarch</span>
            <div className="h-7 w-7 rounded-full border border-border-subtle bg-surface-overlay" />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
    <AssistantPanel />
    </AssistantProvider>
  );
}
