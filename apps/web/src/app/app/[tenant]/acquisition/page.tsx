import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { StrategyChat } from "@/components/strategy-chat";
import { ModuleGate } from "@/components/module-gate";
import { getTenant, MOCK_CAMPAIGNS } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export default async function AcquisitionPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = getTenant(slug);
  if (!tenant) notFound();

  const spend = MOCK_CAMPAIGNS.reduce((s, c) => s + c.spendEur, 0);
  const conversions = MOCK_CAMPAIGNS.reduce((s, c) => s + c.conversions, 0);
  const blendedCpa = conversions ? spend / conversions : 0;

  return (
    <ModuleGate tenant={tenant} moduleKey="acquisition">
      <PageHeader
        title="Customer Acquisition"
        subtitle="AI-driven marketing, ad management, and content creation."
        actions={<Button variant="primary" size="sm">Generate content</Button>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ad spend (mo)" value={formatCurrency(spend)} />
        <Stat label="Conversions" value={String(conversions)} />
        <Stat label="Blended CPA" value={formatCurrency(blendedCpa)} />
        <Stat label="Active channels" value={String(new Set(MOCK_CAMPAIGNS.filter(c => c.status === "active").map(c => c.channel)).size)} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Campaigns</CardTitle>
              <span className="text-xs text-content-muted">{MOCK_CAMPAIGNS.length} total</span>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border-subtle text-left text-[11px] uppercase tracking-wide text-content-muted">
                    <th className="px-4 py-2 font-medium">Campaign</th>
                    <th className="px-4 py-2 font-medium">Channel</th>
                    <th className="px-4 py-2 text-right font-medium">Spend</th>
                    <th className="px-4 py-2 text-right font-medium">CPA</th>
                    <th className="px-4 py-2 text-right font-medium">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_CAMPAIGNS.map((c) => (
                    <tr key={c.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-overlay">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <StatusDot status={c.status} />
                          <span className="font-medium text-content-primary">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 capitalize text-content-secondary">{c.channel}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-content-secondary">{formatCurrency(c.spendEur)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-content-secondary">{c.cpaEur ? formatCurrency(c.cpaEur) : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-content-secondary">{c.conversions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div>
          <StrategyChat tenantName={tenant.name} />
        </div>
      </div>
    </ModuleGate>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody>
        <div className="text-[11px] uppercase tracking-wide text-content-muted">{label}</div>
        <div className="mt-1 font-mono text-lg font-semibold text-content-primary">{value}</div>
      </CardBody>
    </Card>
  );
}
