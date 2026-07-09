import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TenantEntitlementsManager } from "@/components/admin/tenant-entitlements";
import { TenantWorkspaceSwitcher } from "@/components/admin/tenant-workspace-switcher";
import { MODULES, PLANS, TIER_ORDER, tierIncludes } from "@/lib/modules";
import { MOCK_TENANTS } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

/**
 * Super-Admin → Tenants.
 * Onboard tenants and govern which modules each can access (tier + overrides).
 */
export default function TenantsAdminPage() {
  return (
    <>
      <PageHeader
        title="Tenants"
        subtitle="Manage subscriptions and toggle module access per tenant."
        actions={<Button variant="primary" size="sm">Onboard tenant</Button>}
      />

      {/* Pricing reference: which tier unlocks which modules */}
      <section className="mb-6">
        <h2 className="mb-2.5 text-xs font-medium uppercase tracking-wide text-content-muted">
          Plans
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {TIER_ORDER.map((tier) => {
            const plan = PLANS[tier];
            return (
              <Card key={tier}>
                <CardBody>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-content-primary">{plan.name}</span>
                    <span className="font-mono text-sm text-content-secondary">
                      {formatCurrency(plan.priceEurMonthly)}<span className="text-content-muted">/mo</span>
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-content-muted">{plan.tagline}</p>
                  <p className="mt-2 font-mono text-[11px] text-content-muted">
                    {plan.includedCreditsMonthly.toLocaleString()} credits/mo
                  </p>
                  <ul className="mt-3 space-y-1">
                    {MODULES.filter((m) => !m.alwaysOn).map((m) => {
                      const included = tierIncludes(tier, m.key);
                      return (
                        <li
                          key={m.key}
                          className={
                            included
                              ? "flex items-center gap-2 text-xs text-content-secondary"
                              : "flex items-center gap-2 text-xs text-content-muted"
                          }
                        >
                          <span className={included ? "text-status-active" : "text-content-muted/60"}>
                            {included ? "✓" : "+"}
                          </span>
                          <span className={included ? "" : "text-content-muted/70"}>{m.label}</span>
                          {!included && m.addOnPriceEurMonthly && (
                            <span className="ml-auto font-mono text-[10px] text-content-muted/70">
                              {formatCurrency(m.addOnPriceEurMonthly)}/mo
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2.5 text-xs font-medium uppercase tracking-wide text-content-muted">
          Open workspace
        </h2>
        <p className="mb-3 text-sm text-content-secondary">
          Jump into a tenant&apos;s product interface — use Deployments for Bubblbook staging/prod setup.
        </p>
        <TenantWorkspaceSwitcher tenants={MOCK_TENANTS} />
      </section>

      <section>
        <h2 className="mb-2.5 text-xs font-medium uppercase tracking-wide text-content-muted">
          Tenant access
        </h2>
        <TenantEntitlementsManager tenants={MOCK_TENANTS} />
      </section>
    </>
  );
}
