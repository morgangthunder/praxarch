"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { StatusDot } from "@/components/ui/status-dot";
import {
  MODULES,
  MODULE_BY_KEY,
  PLANS,
  TIER_ORDER,
  addOnMonthlyTotal,
  hasModuleAccess,
  isAddOn,
  tierIncludes,
  type ModuleKey,
  type PlanTier,
  type TenantEntitlements,
} from "@/lib/modules";
import type { Tenant } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { OpenTenantWorkspace } from "@/components/admin/open-tenant-workspace";

/**
 * Super-admin control for per-tenant module access.
 *
 * Effective access = per-module override (if set) else the plan-tier default.
 * Operators can change a tenant's plan or force individual modules on/off.
 * State is local in this scaffold; production persists via the BFF.
 */
export function TenantEntitlementsManager({ tenants }: { tenants: Tenant[] }) {
  const [state, setState] = useState<Record<string, TenantEntitlements>>(
    Object.fromEntries(tenants.map((t) => [t.id, t.entitlements]))
  );

  function setTier(tenantId: string, tier: PlanTier) {
    setState((s) => ({ ...s, [tenantId]: { ...s[tenantId], tier } }));
  }

  function toggleModule(tenantId: string, module: ModuleKey, next: boolean) {
    setState((s) => {
      const ent = s[tenantId];
      const tierDefault = tierIncludes(ent.tier, module);
      const overrides = { ...ent.overrides };
      // If the new value matches the tier default, clear the override (clean state).
      if (next === tierDefault) delete overrides[module];
      else overrides[module] = next;
      return { ...s, [tenantId]: { ...ent, overrides } };
    });
  }

  return (
    <div className="space-y-3">
      {tenants.map((t) => {
        const ent = state[t.id];
        const plan = PLANS[ent.tier];
        return (
          <Card key={t.id}>
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <StatusDot status={t.status} />
                <CardTitle>{t.name}</CardTitle>
                <span className="text-xs text-content-muted">/{t.slug}</span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <OpenTenantWorkspace slug={t.slug} name={t.name} variant="ghost" />
                {hasModuleAccess(ent, "deployments") && (
                  <OpenTenantWorkspace
                    slug={t.slug}
                    name={t.name}
                    path="deployments"
                    variant="ghost"
                  >
                    Deployments
                  </OpenTenantWorkspace>
                )}
                <span className="text-xs text-content-muted">
                  {formatCurrency(plan.priceEurMonthly)}
                  {addOnMonthlyTotal(ent) > 0 ? ` + ${formatCurrency(addOnMonthlyTotal(ent))}` : ""}/mo
                </span>
                <select
                  value={ent.tier}
                  onChange={(e) => setTier(t.id, e.target.value as PlanTier)}
                  className="h-7 rounded-lg border border-border-subtle bg-surface-base px-2 text-xs text-content-primary outline-none focus:border-border-strong"
                >
                  {TIER_ORDER.map((tier) => (
                    <option key={tier} value={tier}>
                      {PLANS[tier].name}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardBody className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {MODULES.map((m) => {
                const allowed = hasModuleAccess(ent, m.key);
                const tierDefault = tierIncludes(ent.tier, m.key);
                const addon = isAddOn(ent, m.key);
                const forcedOff = !allowed && tierDefault; // override-disabled below tier
                const Icon = m.icon;
                return (
                  <div
                    key={m.key}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-base px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-content-muted" />
                      <div className="min-w-0">
                        <div className="truncate text-sm text-content-primary">{m.label}</div>
                        <div className="text-[10px] uppercase tracking-wide text-content-muted">
                          {m.alwaysOn ? (
                            <span className="text-content-muted">always on</span>
                          ) : addon ? (
                            <span className="text-status-info">
                              add-on +{formatCurrency(m.addOnPriceEurMonthly ?? 0)}/mo
                            </span>
                          ) : forcedOff ? (
                            <span className="text-status-error">suspended</span>
                          ) : tierDefault ? (
                            <span className="text-status-active">included</span>
                          ) : (
                            <>requires {PLANS[MODULE_BY_KEY[m.key].minTier].name}</>
                          )}
                        </div>
                      </div>
                    </div>
                    <Toggle
                      checked={allowed}
                      disabled={m.alwaysOn}
                      onChange={(next) => toggleModule(t.id, m.key, next)}
                      aria-label={`${m.label} access`}
                    />
                  </div>
                );
              })}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
