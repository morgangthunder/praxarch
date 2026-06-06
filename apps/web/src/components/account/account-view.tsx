"use client";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AllowancePanel } from "@/components/account/allowance-panel";
import { AdSpendPanel } from "@/components/account/ad-spend-panel";
import { AddOnsPanel } from "@/components/account/addons-panel";
import { IntegrationsPanel } from "@/components/account/integrations-panel";
import { TeamPanel } from "@/components/account/team-panel";
import { useWorkspace } from "@/components/workspace-context";
import { PLANS, TIER_ORDER, MODULES, tierIncludes, type PlanTier, type TenantEntitlements } from "@/lib/modules";
import { formatCurrency } from "@/lib/utils";
import type { AdBudget, AdChannelSpend, ModuleSpend, TeamMember } from "@/lib/types";

interface AccountViewProps {
  entitlements: TenantEntitlements;
  addOnsTotal: number;
  credits: { included: number; used: number; topUpRemaining: number; period: string };
  adBudget: AdBudget;
  adChannels: AdChannelSpend[];
  llmByModule: ModuleSpend[];
  team: TeamMember[];
}

export function AccountView(props: AccountViewProps) {
  const { can } = useWorkspace();
  const canBilling = can("manage_billing");
  const canTeam = can("manage_roles");
  const canIntegrations = can("manage_integrations");

  const currentTier = props.entitlements.tier;
  const llmTotal = props.llmByModule.reduce((s, l) => s + l.eur, 0);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {canBilling && <SubscriptionCard currentTier={currentTier} addOnsTotal={props.addOnsTotal} />}
        {canBilling && <AddOnsPanel entitlements={props.entitlements} />}

        {/* LLM spend by module — visible to everyone (read-only usage). */}
        <Card>
          <CardHeader>
            <CardTitle>LLM spend by module (this window)</CardTitle>
            <span className="font-mono text-xs text-content-secondary">{formatCurrency(llmTotal)}</span>
          </CardHeader>
          <CardBody className="space-y-3">
            {props.llmByModule.map((l) => (
              <div key={l.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-content-secondary">{l.label}</span>
                  <span className="font-mono text-content-muted">{formatCurrency(l.eur)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-overlay">
                  <div className="h-full rounded-full bg-content-secondary" style={{ width: `${l.pct}%` }} />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>

        {canTeam && <TeamPanel initial={props.team} />}
      </div>

      <div className="space-y-5">
        {/* Both meters — read-only for non-owners. */}
        <AllowancePanel
          includedAllowance={props.credits.included}
          used={props.credits.used}
          topUpRemaining={props.credits.topUpRemaining}
          period={props.credits.period}
          readOnly={!canBilling}
        />
        <AdSpendPanel budget={props.adBudget} channels={props.adChannels} readOnly={!canBilling} />
        {canIntegrations && <IntegrationsPanel />}
      </div>
    </div>
  );
}

function SubscriptionCard({ currentTier, addOnsTotal }: { currentTier: PlanTier; addOnsTotal: number }) {
  const currentPlan = PLANS[currentTier];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription</CardTitle>
        <span className="text-xs text-content-muted">
          {currentPlan.name} {formatCurrency(currentPlan.priceEurMonthly)}
          {addOnsTotal > 0 ? ` + ${formatCurrency(addOnsTotal)} add-ons` : ""}/mo
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
                  <li key={m.key} className="text-[11px] text-content-muted">{m.label}</li>
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
  );
}
