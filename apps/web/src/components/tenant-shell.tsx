"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";
import { MODULES, PLANS, hasModuleAccess } from "@/lib/modules";
import type { Tenant } from "@/lib/types";

/**
 * White-labeled tenant shell. The left nav renders ONE entry per product
 * module; modules the tenant isn't entitled to appear locked with an upgrade
 * hint (driven by subscription tier + per-module overrides).
 */
export function TenantShell({ tenant, children }: { tenant: Tenant; children: React.ReactNode }) {
  const pathname = usePathname();
  const base = `/app/${tenant.slug}`;
  const plan = PLANS[tenant.entitlements.tier];

  return (
    <div className="flex min-h-screen bg-surface-base">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border-subtle bg-surface-raised md:flex">
        {/* White-label brand block (tenant name, not Praxarch) */}
        <div className="flex h-14 items-center gap-2 px-4">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-content-primary font-mono text-xs font-bold text-surface-base">
            {tenant.name.charAt(0)}
          </div>
          <span className="truncate text-sm font-semibold tracking-tight">{tenant.name}</span>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {MODULES.map((m) => {
            const allowed = hasModuleAccess(tenant.entitlements, m.key);
            const href = `${base}/${m.path}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            const Icon = m.icon;

            if (!allowed) {
              // Locked module → route to Account (upgrade) and show the lock.
              return (
                <Link
                  key={m.key}
                  href={`${base}/account`}
                  title={`${m.label} — requires ${PLANS[m.minTier].name} plan`}
                  className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-content-muted transition-colors hover:bg-surface-overlay"
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-50" />
                  <span className="truncate opacity-70">{m.label}</span>
                  <Lock className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" />
                </Link>
              );
            }

            return (
              <Link
                key={m.key}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-surface-overlay text-content-primary"
                    : "text-content-secondary hover:bg-surface-overlay hover:text-content-primary"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{m.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-border-subtle p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-content-muted">Plan</span>
            <span className="rounded border border-border-subtle bg-surface-overlay px-1.5 py-0.5 font-medium text-content-secondary">
              {plan.name}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-content-muted">
            <span>Status</span>
            <StatusDot status={tenant.status} withLabel />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-border-subtle bg-surface-raised px-4">
          <div className="text-sm font-medium text-content-secondary">
            {tenant.name}
            <span className="ml-2 text-xs font-normal text-content-muted">workspace</span>
          </div>
          {/* In production this admin affordance is hidden for tenant users. */}
          <Link
            href="/tenants"
            className="rounded-lg border border-border-subtle px-2.5 py-1 text-xs text-content-muted transition-colors hover:bg-surface-overlay hover:text-content-secondary"
          >
            Exit to admin
          </Link>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
