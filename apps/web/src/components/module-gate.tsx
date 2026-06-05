import { Lock } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  MODULE_BY_KEY,
  PLANS,
  hasModuleAccess,
  type ModuleKey,
} from "@/lib/modules";
import type { Tenant } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

/**
 * Route-level access guard for a tenant module.
 *
 * Renders the module content only when the tenant is entitled; otherwise shows
 * a locked screen offering two paths: enable à la carte, or upgrade the tier.
 * Backstops the nav so direct-URL access can't bypass the entitlement.
 */
export function ModuleGate({
  tenant,
  moduleKey,
  children,
}: {
  tenant: Tenant;
  moduleKey: ModuleKey;
  children: React.ReactNode;
}) {
  if (hasModuleAccess(tenant.entitlements, moduleKey)) {
    return <>{children}</>;
  }

  const mod = MODULE_BY_KEY[moduleKey];
  const requiredPlan = PLANS[mod.minTier];
  const Icon = mod.icon;

  return (
    <div className="mx-auto max-w-md pt-10">
      <Card>
        <CardBody className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-border-subtle bg-surface-base">
            <Icon className="h-5 w-5 text-content-muted" />
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border-subtle bg-surface-overlay">
              <Lock className="h-3 w-3 text-status-pending" />
            </span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-content-primary">{mod.label}</h2>
            <p className="mt-1 text-sm text-content-muted">{mod.blurb}</p>
          </div>

          <div className="flex w-full flex-col gap-2 pt-1">
            {mod.addOnPriceEurMonthly && (
              <Button variant="primary" size="md" className="w-full">
                Add for {formatCurrency(mod.addOnPriceEurMonthly)}/mo
              </Button>
            )}
            <Button variant="secondary" size="md" className="w-full">
              Or upgrade to {requiredPlan.name}
            </Button>
          </div>
          <p className="text-[11px] text-content-muted">
            Included with {requiredPlan.name}
            {mod.addOnPriceEurMonthly ? " · or add à la carte to your current plan" : ""}.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
