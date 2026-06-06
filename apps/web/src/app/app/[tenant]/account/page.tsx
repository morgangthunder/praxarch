import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ModuleGate } from "@/components/module-gate";
import { AccountView } from "@/components/account/account-view";
import {
  getTenant,
  getAdBudget,
  getAdChannelSpend,
  MOCK_CREDITS,
  MOCK_CREDITS_USED,
  MOCK_TOPUP_REMAINING,
  MOCK_LLM_BY_MODULE,
  MOCK_TEAM,
} from "@/lib/mock-data";
import { PLANS, addOnMonthlyTotal } from "@/lib/modules";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = getTenant(slug);
  if (!tenant) notFound();

  const currentPlan = PLANS[tenant.entitlements.tier];

  return (
    <ModuleGate tenant={tenant} moduleKey="account">
      <PageHeader
        title="Account"
        subtitle="Usage, plan & add-ons, ad budget, team, and integrations."
      />
      <AccountView
        entitlements={tenant.entitlements}
        addOnsTotal={addOnMonthlyTotal(tenant.entitlements)}
        credits={{
          included: currentPlan.includedCreditsMonthly,
          used: MOCK_CREDITS_USED,
          topUpRemaining: MOCK_TOPUP_REMAINING,
          period: MOCK_CREDITS.period,
        }}
        adBudget={getAdBudget(tenant)}
        adChannels={getAdChannelSpend(tenant)}
        llmByModule={MOCK_LLM_BY_MODULE}
        team={MOCK_TEAM}
      />
    </ModuleGate>
  );
}
