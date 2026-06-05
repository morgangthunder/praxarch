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

/**
 * Route-level access guard for a tenant module.
 *
 * Renders the module content only when the tenant is entitled; otherwise shows
 * an upgrade screen. This backstops the nav so direct-URL access to a locked
 * module can't bypass the entitlement (UI mirror of the server-side check).
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
    <div className="mx-auto max-w-lg pt-10">
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
          <div className="rounded-lg border border-status-pending/30 bg-status-pending/10 px-3 py-1.5 text-xs text-status-pending">
            Available on the {requiredPlan.name} plan
          </div>
          <Button variant="primary" size="md">Upgrade to {requiredPlan.name}</Button>
        </CardBody>
      </Card>
    </div>
  );
}
