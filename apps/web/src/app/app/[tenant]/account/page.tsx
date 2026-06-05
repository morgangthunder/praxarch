import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AllowancePanel } from "@/components/account/allowance-panel";
import { AddOnsPanel } from "@/components/account/addons-panel";
import { IntegrationsPanel } from "@/components/account/integrations-panel";
import { getTenant, MOCK_CREDITS, MOCK_CREDITS_USED, MOCK_TOPUP_REMAINING } from "@/lib/mock-data";
import {
  PLANS,
  TIER_ORDER,
  MODULES,
  addOnMonthlyTotal,
  tierIncludes,
} from "@/lib/modules";
import { formatCurrency } from "@/lib/utils";

const LLM_SPEND = [
  { model: "Grok (chat + agents)", eur: 41.2, pct: 60 },
  { model: "Content generation", eur: 19.6, pct: 28 },
  { model: "Embeddings / search", eur: 8.1, pct: 12 },
];

export default async function AccountPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = getTenant(slug);
  if (!tenant) notFound();

  const currentTier = tenant.entitlements.tier;
  const currentPlan = PLANS[currentTier];
  const addOns = addOnMonthlyTotal(tenant.entitlements);

  return (
    <>
      <PageHeader
        title="Account"
        subtitle="Plan, add-ons, credit allowance, LLM spend, and integrations."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Plan + upgrade path */}
          <Card>
            <CardHeader>
              <CardTitle>Subscription</CardTitle>
              <span className="text-xs text-content-muted">
                {currentPlan.name} {formatCurrency(currentPlan.priceEurMonthly)}
                {addOns > 0 ? ` + ${formatCurrency(addOns)} add-ons` : ""}/mo
              </span>
            </CardHeader>
            <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {TIER_ORDER.map((tier) => {
                const plan = PLANS[tier];
                const isCurrent = tier === currentTier;
                return (
                  <div
                    key={tier}
                    className={
                      isCurrent
                        ? "rounded-lg border border-status-active/40 bg-status-active/5 p-3"
                        : "rounded-lg border border-border-subtle bg-surface-base p-3"
                    }
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold text-content-primary">{plan.name}</span>
                      <span className="font-mono text-xs text-content-secondary">
                        {formatCurrency(plan.priceEurMonthly)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-content-muted">
                      {plan.includedCreditsMonthly.toLocaleString()} credits/mo
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {MODULES.filter((m) => !m.alwaysOn && tierIncludes(tier, m.key)).map((m) => (
                        <li key={m.key} className="text-[11px] text-content-muted">
                          {m.label}
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant={isCurrent ? "secondary" : "primary"}
                      size="sm"
                      className="mt-3 w-full"
                      disabled={isCurrent}
                    >
                      {isCurrent ? "Current plan" : `Switch to ${plan.name}`}
                    </Button>
                  </div>
                );
              })}
            </CardBody>
          </Card>

          <AddOnsPanel entitlements={tenant.entitlements} />

          {/* LLM spend breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>LLM spend (this window)</CardTitle>
              <span className="font-mono text-xs text-content-secondary">
                {formatCurrency(LLM_SPEND.reduce((s, l) => s + l.eur, 0))}
              </span>
            </CardHeader>
            <CardBody className="space-y-3">
              {LLM_SPEND.map((l) => (
                <div key={l.model}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-content-secondary">{l.model}</span>
                    <span className="font-mono text-content-muted">{formatCurrency(l.eur)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-overlay">
                    <div className="h-full rounded-full bg-content-secondary" style={{ width: `${l.pct}%` }} />
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <AllowancePanel
            includedAllowance={currentPlan.includedCreditsMonthly}
            used={MOCK_CREDITS_USED}
            topUpRemaining={MOCK_TOPUP_REMAINING}
            period={MOCK_CREDITS.period}
          />
          <IntegrationsPanel />
        </div>
      </div>
    </>
  );
}
