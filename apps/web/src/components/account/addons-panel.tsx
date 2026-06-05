"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  MODULES,
  tierIncludes,
  type ModuleKey,
  type TenantEntitlements,
} from "@/lib/modules";
import { formatCurrency } from "@/lib/utils";

/**
 * À la carte add-ons: enable individual modules above the tenant's tier for a
 * monthly fee, without upgrading the whole plan. State is local in this scaffold.
 */
export function AddOnsPanel({ entitlements }: { entitlements: TenantEntitlements }) {
  // Candidates = modules not already included by the tier and not always-on.
  const candidates = MODULES.filter(
    (m) => !m.alwaysOn && !tierIncludes(entitlements.tier, m.key) && m.addOnPriceEurMonthly
  );

  const [added, setAdded] = useState<Record<string, boolean>>(
    Object.fromEntries(candidates.map((m) => [m.key, entitlements.overrides[m.key] === true]))
  );

  const total = candidates
    .filter((m) => added[m.key])
    .reduce((s, m) => s + (m.addOnPriceEurMonthly ?? 0), 0);

  function toggle(key: ModuleKey) {
    setAdded((a) => ({ ...a, [key]: !a[key] }));
  }

  if (candidates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Add-ons</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-content-muted">Your plan already includes every module.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add-ons</CardTitle>
        {total > 0 && (
          <span className="font-mono text-xs text-content-secondary">
            +{formatCurrency(total)}/mo
          </span>
        )}
      </CardHeader>
      <div className="divide-y divide-border-subtle">
        {candidates.map((m) => {
          const Icon = m.icon;
          const on = added[m.key];
          return (
            <div key={m.key} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0 text-content-muted" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-content-primary">{m.label}</div>
                  <div className="truncate text-xs text-content-muted">{m.blurb}</div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <span className="font-mono text-xs text-content-secondary">
                  {formatCurrency(m.addOnPriceEurMonthly ?? 0)}/mo
                </span>
                <Button variant={on ? "secondary" : "primary"} size="sm" onClick={() => toggle(m.key)}>
                  {on ? "Remove" : "Add"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
