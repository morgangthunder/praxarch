import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ModuleGate } from "@/components/module-gate";
import { DeployActivityHistory } from "@/components/deployments/deploy-activity-history";
import { getTenant } from "@/lib/mock-data";

export default async function DeployActivityPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = getTenant(slug);
  if (!tenant) notFound();

  return (
    <ModuleGate tenant={tenant} moduleKey="deployments">
      <PageHeader
        title="Deploy activity"
        subtitle="Full history of staging and production deploys for this workspace."
      />
      <DeployActivityHistory tenantSlug={slug} />
    </ModuleGate>
  );
}
