import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentCard } from "@/components/agent-card";
import { CreditMeter } from "@/components/credit-meter";
import { AutonomyToggle } from "@/components/autonomy-toggle";
import { StrategyChat } from "@/components/strategy-chat";
import { StatusDot } from "@/components/ui/status-dot";
import { MOCK_AGENTS, MOCK_CREDITS, MOCK_TENANTS } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

/**
 * White-labeled Client Dashboard.
 * Tenant users monitor metrics, toggle autonomy, and refine strategy via chat.
 */
export default async function ClientDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = MOCK_TENANTS.find((t) => t.slug === slug);
  if (!tenant) notFound();

  return (
    <>
      <PageHeader
        title={tenant.name}
        subtitle="Your autonomous marketing operation."
        actions={<StatusDot status={tenant.status} withLabel />}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Autonomy control */}
          <Card>
            <CardHeader>
              <CardTitle>Autonomy Level</CardTitle>
            </CardHeader>
            <CardBody>
              <AutonomyToggle value={tenant.autonomy} />
            </CardBody>
          </Card>

          {/* Business metrics */}
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Monthly spend" value={formatCurrency(tenant.monthlySpendEur)} />
            <Metric label="Active agents" value={String(tenant.activeAgents)} />
            <Metric label="Margin" value={`${tenant.marginPct}%`} />
          </div>

          {/* This tenant's agents */}
          <section>
            <h2 className="mb-2.5 text-xs font-medium uppercase tracking-wide text-content-muted">
              Your Agents
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {MOCK_AGENTS.map((a) => (
                <AgentCard key={a.id} agent={a} />
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <CreditMeter data={MOCK_CREDITS} />
          <StrategyChat tenantName={tenant.name} />
        </div>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody>
        <div className="text-[11px] uppercase tracking-wide text-content-muted">{label}</div>
        <div className="mt-1 font-mono text-lg font-semibold text-content-primary">{value}</div>
      </CardBody>
    </Card>
  );
}
