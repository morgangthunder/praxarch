import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { AgentCard } from "@/components/agent-card";
import { AutonomyToggle } from "@/components/autonomy-toggle";
import { ModuleGate } from "@/components/module-gate";
import { getTenant, MOCK_AGENTS, MOCK_AUTOMATIONS } from "@/lib/mock-data";

export default async function AutomationsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = getTenant(slug);
  if (!tenant) notFound();

  return (
    <ModuleGate tenant={tenant} moduleKey="automations">
      <PageHeader
        title="Automations"
        subtitle="Your agents and the n8n-driven workflows that run your business."
        actions={<Button variant="primary" size="sm">Build automation</Button>}
      />

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Autonomy</CardTitle>
        </CardHeader>
        <CardBody>
          <AutonomyToggle value={tenant.autonomy} />
        </CardBody>
      </Card>

      <section className="mb-5">
        <h2 className="mb-2.5 text-xs font-medium uppercase tracking-wide text-content-muted">
          Your Agents
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {MOCK_AGENTS.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Workflows</CardTitle>
          <span className="text-xs text-content-muted">n8n-backed</span>
        </CardHeader>
        <div className="divide-y divide-border-subtle">
          {MOCK_AUTOMATIONS.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <StatusDot status={a.status} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-content-primary">{a.name}</div>
                  <div className="truncate text-xs text-content-muted">{a.trigger}</div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <div className="text-right">
                  <div className="font-mono text-sm text-content-secondary">{a.runsToday}</div>
                  <div className="text-[10px] uppercase tracking-wide text-content-muted">runs today</div>
                </div>
                <Button variant="ghost" size="sm">Edit</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </ModuleGate>
  );
}
