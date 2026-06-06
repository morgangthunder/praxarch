import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ModuleGate } from "@/components/module-gate";
import { AcquisitionHub } from "@/components/acquisition/acquisition-hub";
import {
  getTenant,
  getCampaigns,
  getContentDrafts,
  getFunnel,
  getLeads,
} from "@/lib/mock-data";

export default async function AcquisitionPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = getTenant(slug);
  if (!tenant) notFound();

  // Sync mock paints instantly; ContentTab hydrates from the BFF on mount.
  const content = getContentDrafts(tenant);

  return (
    <ModuleGate tenant={tenant} moduleKey="acquisition">
      <PageHeader
        title="Customer Acquisition"
        subtitle="Campaigns, content, and top-of-funnel leads — synced into CRM for pipeline management."
        actions={<Button variant="secondary" size="sm">New campaign</Button>}
      />
      <AcquisitionHub
        slug={slug}
        tenantName={tenant.name}
        autonomy={tenant.autonomy}
        campaigns={getCampaigns(tenant)}
        content={content}
        funnel={getFunnel(tenant)}
        leads={getLeads(tenant)}
      />
    </ModuleGate>
  );
}
