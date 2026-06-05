import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle, CardDivider } from "@/components/ui/card";
import { DeployButton } from "@/components/deploy-button";
import { StatusDot } from "@/components/ui/status-dot";
import { ModuleGate } from "@/components/module-gate";
import { getTenant, MOCK_DEPLOYMENTS } from "@/lib/mock-data";

export default async function DeploymentsPage({
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
        title="Deployments"
        subtitle="Promote to production, choose source branches, and configure CI/CD."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Deployment history</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border-subtle text-left text-[11px] uppercase tracking-wide text-content-muted">
                    <th className="px-4 py-2 font-medium">Environment</th>
                    <th className="px-4 py-2 font-medium">Branch</th>
                    <th className="px-4 py-2 font-medium">Commit</th>
                    <th className="px-4 py-2 font-medium">By</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_DEPLOYMENTS.map((d) => (
                    <tr key={d.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-overlay">
                      <td className="px-4 py-2.5 capitalize text-content-primary">{d.environment}</td>
                      <td className="px-4 py-2.5 font-mono text-content-secondary">{d.branch}</td>
                      <td className="px-4 py-2.5 font-mono text-content-muted">{d.commit}</td>
                      <td className="px-4 py-2.5 text-content-secondary">{d.actor}</td>
                      <td className="px-4 py-2.5"><StatusDot status={d.status} withLabel /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {/* Deploy panel */}
          <Card>
            <CardHeader>
              <CardTitle>Ship a release</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <Field label="Source branch">
                <select className="h-9 w-full rounded-lg border border-border-subtle bg-surface-base px-2.5 text-sm text-content-primary outline-none focus:border-border-strong">
                  <option>main</option>
                  <option>release/2026-06</option>
                  <option>feat/checkout-v2</option>
                </select>
              </Field>
              <Field label="Target">
                <select className="h-9 w-full rounded-lg border border-border-subtle bg-surface-base px-2.5 text-sm text-content-primary outline-none focus:border-border-strong">
                  <option>staging</option>
                  <option>production</option>
                </select>
              </Field>
              <CardDivider />
              <div className="flex items-center justify-between gap-2">
                <DeployButton environment="staging" project={`${slug}-web`} />
                <DeployButton environment="production" project={`${slug}-web`} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>CI/CD</CardTitle>
              <StatusDot status="active" withLabel label="Connected" />
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              <Row k="Provider" v="Coolify" />
              <Row k="Auto-deploy" v="main → production" />
              <Row k="Approval" v="WhatsApp HITL on prod" />
            </CardBody>
          </Card>
        </div>
      </div>
    </ModuleGate>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-content-muted">{label}</span>
      {children}
    </label>
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
