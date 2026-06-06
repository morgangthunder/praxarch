import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { ModuleGate } from "@/components/module-gate";
import { DeploymentsBoard } from "@/components/deployments/deployments-board";
import { getTenant, getServices, MOCK_DEPLOYMENTS } from "@/lib/mock-data";

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

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>CI/CD</CardTitle>
              <StatusDot status="active" withLabel label="Connected" />
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              <Row k="Provider" v="Coolify" />
              <Row k="Auto-deploy" v="main → staging" />
              <Row k="Prod promote" v="One-click (Owner)" />
              <Row k="Approval" v="WhatsApp HITL for Members" />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <div className="divide-y divide-border-subtle">
              {MOCK_DEPLOYMENTS.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <StatusDot status={d.status} />
                  <span className="capitalize text-content-primary">{d.environment}</span>
                  <span className="font-mono text-[11px] text-content-muted">
                    {d.branch}@{d.commit}
                  </span>
                  <span className="ml-auto text-[11px] text-content-muted">{d.actor}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </ModuleGate>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-content-muted">{k}</span>
      <span className="text-content-secondary">{v}</span>
    </div>
  );
}
