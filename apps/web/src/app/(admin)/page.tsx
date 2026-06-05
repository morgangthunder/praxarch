import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { AgentCard } from "@/components/agent-card";
import { TenantTable } from "@/components/tenant-table";
import { CreditMeter } from "@/components/credit-meter";
import { CheckpointQueue } from "@/components/checkpoint-queue";
import { DeployButton } from "@/components/deploy-button";
import { StatusDot } from "@/components/ui/status-dot";
import {
  MOCK_AGENTS,
  MOCK_CHECKPOINTS,
  MOCK_CREDITS,
  MOCK_TENANTS,
} from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

/**
 * Super-Admin Control Center.
 * Global observability across all tenants + the high-level strategist engine.
 * This view is platform-operator only — never exposed to tenants.
 */
export default function ControlCenterPage() {
  const totalSpend = MOCK_TENANTS.reduce((s, t) => s + t.monthlySpendEur, 0);
  const activeAgents = MOCK_TENANTS.reduce((s, t) => s + t.activeAgents, 0);

  return (
    <>
      <PageHeader
        title="Control Center"
        subtitle="Global observability across all tenants and the MoM strategist network."
        actions={<DeployButton environment="production" />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tenants" value={String(MOCK_TENANTS.length)} status="active" />
        <Stat label="Active agents" value={String(activeAgents)} status="active" />
        <Stat label="Awaiting approval" value={String(MOCK_CHECKPOINTS.length)} status="pending" />
        <Stat label="Monthly spend" value={formatCurrency(totalSpend)} status="info" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section>
            <h2 className="mb-2.5 text-xs font-medium uppercase tracking-wide text-content-muted">
              MoM Strategist Network
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {MOCK_AGENTS.map((a) => (
                <AgentCard key={a.id} agent={a} />
              ))}
            </div>
          </section>
          <TenantTable tenants={MOCK_TENANTS} />
        </div>

        <div className="space-y-5">
          <CreditMeter data={MOCK_CREDITS} />
          <CheckpointQueue checkpoints={MOCK_CHECKPOINTS} />
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: "active" | "pending" | "info";
}) {
  return (
    <Card>
      <CardBody className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-content-muted">{label}</div>
          <div className="mt-1 font-mono text-xl font-semibold text-content-primary">{value}</div>
        </div>
        <StatusDot status={status} />
      </CardBody>
    </Card>
  );
}
