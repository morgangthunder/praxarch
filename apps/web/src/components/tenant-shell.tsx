"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { Lock, Shield, ChevronDown } from "lucide-react";
import { StatusDot } from "@/components/ui/status-dot";
import { WorkspaceProvider } from "@/components/workspace-context";
import { AssistantProvider } from "@/components/assistant/assistant-context";
import { AssistantLauncher, AssistantPanel } from "@/components/assistant/assistant-panel";
import { CommandMenu } from "@/components/command-menu";
import { cn } from "@/lib/utils";
import { MODULES, PLANS, hasModuleAccess } from "@/lib/modules";
import { VIEW_OPTIONS, isSuperAdmin, roleCanSeeModule, type ViewIdentity } from "@/lib/roles";
import type { Tenant } from "@/lib/types";

const SUPER_ADMIN_LINKS = [
  { href: "/admin", label: "Control Center" },
  { href: "/admin/tenants", label: "Tenants" },
  { href: "/admin/flows", label: "Flow Studio" },
  { href: "/admin/ai-models", label: "AI Models" },
  { href: "/admin/prompts", label: "Prompt Registry" },
];

/**
 * Primary tenant workspace shell. The left nav is the tenant's product modules,
 * filtered by both entitlement (tier/add-on) and the current user's workspace
 * role. The platform console is collapsed behind a single "Super Admin" group
 * shown only to super-admins. A "View as" toggle previews each role.
 */
export function TenantShell({ tenant, children }: { tenant: Tenant; children: React.ReactNode }) {
  const pathname = usePathname();
  const base = `/app/${tenant.slug}`;
  const plan = PLANS[tenant.entitlements.tier];

  /**
   * Instant skeleton overlay on nav click. IMPORTANT: we must keep `{children}`
   * mounted — replacing them blocked the App Router from completing navigation
   * (pages never loaded, skeleton stuck indefinitely).
   */
  const [navPending, setNavPending] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const mounted = useRef(false);
  const lastPathname = useRef(pathname);

  /** Sidebar / admin link clicked — highlight + skeleton immediately. */
  const beginNavigation = (href: string) => {
    if (href === pathname && !navPending) return;
    setPendingHref(href);
    setNavPending(true);
  };

  /** In-page links (overview tiles) don't call beginNavigation — catch pathname change. */
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      lastPathname.current = pathname;
      return;
    }
    if (pathname === lastPathname.current) return;
    lastPathname.current = pathname;
    if (!pendingHref) {
      setPendingHref(pathname);
      setNavPending(true);
    }
  }, [pathname, pendingHref]);

  /** Hide overlay once the URL and RSC payload have both caught up. */
  useEffect(() => {
    if (!navPending || !pendingHref) return;
    const atTarget =
      pathname === pendingHref || pathname.startsWith(`${pendingHref}/`);
    if (!atTarget) return;
    const id = requestAnimationFrame(() => {
      setNavPending(false);
      setPendingHref(null);
    });
    return () => cancelAnimationFrame(id);
  }, [pathname, pendingHref, navPending, children]);

  /** Fail-open if a dev compile hangs — never trap the user on skeleton forever. */
  useEffect(() => {
    if (!navPending) return;
    const t = window.setTimeout(() => {
      console.warn("[Praxarch] Navigation overlay timeout — showing page anyway");
      setNavPending(false);
      setPendingHref(null);
    }, 12_000);
    return () => clearTimeout(t);
  }, [navPending, pendingHref]);

  /** Nav highlight follows the click target immediately, not the stale URL. */
  const navTarget = pendingHref ?? pathname;
  const isNavActive = (href: string) =>
    navTarget === href || navTarget.startsWith(`${href}/`);

  // Demo-only identity switch (stands in for real auth). Persisted across reloads.
  const [view, setView] = useState<ViewIdentity>("super_admin");
  const [adminOpen, setAdminOpen] = useState(true);
  useEffect(() => {
    const stored = window.localStorage.getItem("praxarch_view") as ViewIdentity | null;
    if (stored) setView(stored);
  }, []);
  const changeView = (v: ViewIdentity) => {
    setView(v);
    window.localStorage.setItem("praxarch_view", v);
  };

  // Remember the active workspace so super-admins can hop back from /admin.
  useEffect(() => {
    window.localStorage.setItem(
      "praxarch_active_tenant",
      JSON.stringify({ slug: tenant.slug, name: tenant.name })
    );
  }, [tenant.slug, tenant.name]);

  const showAdmin = isSuperAdmin(view);

  return (
    <WorkspaceProvider value={{ view, setView: changeView, tenantSlug: tenant.slug, tenantName: tenant.name }}>
      <AssistantProvider tenantSlug={tenant.slug} role={view}>
      <div className="flex min-h-screen bg-surface-base">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border-subtle bg-surface-raised md:flex">
          <div className="flex h-14 items-center gap-2 px-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-content-primary font-mono text-xs font-bold text-surface-base">
              {tenant.name.charAt(0)}
            </div>
            <span className="truncate text-sm font-semibold tracking-tight">{tenant.name}</span>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
            {MODULES.filter((m) => roleCanSeeModule(view, m.key)).map((m) => {
              const allowed = hasModuleAccess(tenant.entitlements, m.key);
              const href = `${base}/${m.path}`;
              const active = isNavActive(href);
              const Icon = m.icon;

              if (!allowed) {
                return (
                  <Link
                    key={m.key}
                    href={href}
                    onClick={() => beginNavigation(href)}
                    title={`${m.label} — requires ${PLANS[m.minTier].name} plan or add-on`}
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
                  onClick={() => beginNavigation(href)}
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

            {/* Super Admin — single collapsible group, only for super-admins */}
            {showAdmin && (
              <div className="mt-3 border-t border-border-subtle pt-3">
                <button
                  onClick={() => setAdminOpen((o) => !o)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-overlay hover:text-content-primary"
                >
                  <Shield className="h-4 w-4 shrink-0 text-status-pending" />
                  <span className="truncate">Super Admin</span>
                  <ChevronDown
                    className={cn("ml-auto h-3.5 w-3.5 shrink-0 transition-transform", adminOpen && "rotate-180")}
                  />
                </button>
                {adminOpen && (
                  <div className="mt-0.5 space-y-0.5 pl-3">
                    {SUPER_ADMIN_LINKS.map((l) => {
                      const active =
                        l.href === "/admin" ? navTarget === "/admin" : navTarget.startsWith(l.href);
                      return (
                        <Link
                          key={l.href}
                          href={l.href}
                          onClick={() => beginNavigation(l.href)}
                          className={cn(
                            "block rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                            active
                              ? "bg-surface-overlay text-content-primary"
                              : "text-content-muted hover:bg-surface-overlay hover:text-content-secondary"
                          )}
                        >
                          {l.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
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
            {/* Demo "View as" — stands in for the signed-in user's role. */}
            <div className="flex items-center gap-2">
              <CommandMenu />
              <AssistantLauncher />
              <span className="hidden text-[11px] uppercase tracking-wide text-content-muted sm:inline">
                View as
              </span>
              <div className="inline-flex rounded-lg border border-border-subtle bg-surface-base p-0.5">
                {VIEW_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => changeView(o.id)}
                    title={o.hint}
                    className={cn(
                      "rounded-[0.4rem] px-2 py-1 text-xs font-medium transition-colors",
                      view === o.id
                        ? "bg-surface-overlay text-content-primary"
                        : "text-content-muted hover:text-content-secondary"
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </header>
          <main className="relative flex-1 overflow-y-auto p-4 md:p-6">
            {navPending && (
              <div
                className="absolute inset-0 z-10 overflow-y-auto bg-surface-base p-4 md:p-6"
                aria-busy="true"
                aria-label="Loading page"
              >
                <PageSkeleton />
              </div>
            )}
            {/* Always mounted so Next.js can stream the new route segment. */}
            <div className={navPending ? "invisible" : undefined}>{children}</div>
          </main>
        </div>
      </div>
      <AssistantPanel />
      </AssistantProvider>
    </WorkspaceProvider>
  );
}
