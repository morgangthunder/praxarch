"use client";

import { Card, CardBody } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { hasModuleAccess } from "@/lib/modules";
import type { Tenant } from "@/lib/types";
import { OpenTenantWorkspace } from "@/components/admin/open-tenant-workspace";

/**
 * Quick jump from Super-Admin → Tenants into any client workspace.
 * Sets the active-tenant marker so "Back to …" in admin resolves correctly.
 */
export function TenantWorkspaceSwitcher({ tenants }: { tenants: Tenant[] }) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tenants.map((t) => {
        const deployments = hasModuleAccess(t.entitlements, "deployments");
        return (
          <Card key={t.id}>
            <CardBody className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusDot status={t.status} />
                  <span className="truncate text-sm font-semibold text-content-primary">{t.name}</span>
                </div>
                <span className="font-mono text-[11px] text-content-muted">/app/{t.slug}</span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <OpenTenantWorkspace slug={t.slug} name={t.name} />
                {deployments && (
                  <OpenTenantWorkspace
                    slug={t.slug}
                    name={t.name}
                    path="deployments"
                    variant="link"
                  >
                    Deployments
                  </OpenTenantWorkspace>
                )}
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
