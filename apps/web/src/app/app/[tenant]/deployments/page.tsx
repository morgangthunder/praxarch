import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ModuleGate } from "@/components/module-gate";
import { DeploymentsBoard } from "@/components/deployments/deployments-board";
import { DeploymentsInsights } from "@/components/deployments/deployments-insights";
import { getTenant, getServices } from "@/lib/mock-data";

export default async function DeploymentsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = getTenant(slug);
  if (!tenant) notFound();

  // Sync mock paints instantly; DeploymentsBoard hydrates from the BFF on mount.
  const services = getServices(tenant);

  return (
    <ModuleGate tenant={tenant} moduleKey="deployments">
      <PageHeader
        title="Deployments"
        subtitle="Promote services to production or request a promote when approval is required."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DeploymentsBoard initialServices={services} tenantSlug={slug} />
        </div>

        <DeploymentsInsights tenantSlug={slug} />
      </div>
    </ModuleGate>
  );
}
