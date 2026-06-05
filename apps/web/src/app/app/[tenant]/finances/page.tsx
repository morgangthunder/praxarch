import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CountryGuidance } from "@/components/finances/country-guidance";
import { ModuleGate } from "@/components/module-gate";
import { getTenant, MOCK_FILINGS, MOCK_FINANCE } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";
import type { FilingObligation } from "@/lib/types";

const FILING_STYLE: Record<FilingObligation["status"], string> = {
  upcoming: "text-content-secondary",
  due_soon: "text-status-pending",
  overdue: "text-status-error",
  filed: "text-status-active",
};

export default async function FinancesPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = getTenant(slug);
  if (!tenant) notFound();

  return (
    <ModuleGate tenant={tenant} moduleKey="finances">
      <PageHeader
        title="Finances"
        subtitle="Accounting integration, filing guidance, and financial analysis."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cash" value={formatCurrency(MOCK_FINANCE.cashEur)} />
        <Stat label="MRR" value={formatCurrency(MOCK_FINANCE.mrrEur)} />
        <Stat label="Burn (mo)" value={formatCurrency(MOCK_FINANCE.burnEur)} />
        <Stat label="Runway" value={`${MOCK_FINANCE.runwayMonths} mo`} accent />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Filing obligations</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border-subtle text-left text-[11px] uppercase tracking-wide text-content-muted">
                    <th className="px-4 py-2 font-medium">Obligation</th>
                    <th className="px-4 py-2 font-medium">Authority</th>
                    <th className="px-4 py-2 font-medium">Due</th>
                    <th className="px-4 py-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_FILINGS.map((f) => (
                    <tr key={f.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-overlay">
                      <td className="px-4 py-2.5 font-medium text-content-primary">{f.name}</td>
                      <td className="px-4 py-2.5 text-content-secondary">{f.authority}</td>
                      <td className="px-4 py-2.5 font-mono text-content-muted">{f.dueDate}</td>
                      <td className={`px-4 py-2.5 text-right text-xs font-medium capitalize ${FILING_STYLE[f.status]}`}>
                        {f.status.replace("_", " ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Analysis &amp; recommendations</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm text-content-secondary">
              <Rec text="Burn rose 9% MoM — driven by ad spend on TikTok creator seeding (CPA €18.90)." />
              <Rec text="VAT return due in 14 days; estimated liability €4,120. Set aside now." />
              <Rec text="Runway 8.4 months. At current MRR growth (6%/mo) you reach breakeven in ~5 months." />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <CountryGuidance />
        </div>
      </div>
    </ModuleGate>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardBody>
        <div className="text-[11px] uppercase tracking-wide text-content-muted">{label}</div>
        <div className={`mt-1 font-mono text-lg font-semibold ${accent ? "text-status-active" : "text-content-primary"}`}>
          {value}
        </div>
      </CardBody>
    </Card>
  );
}

function Rec({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-border-subtle bg-surface-base px-3 py-2">
      <span className="mt-0.5 text-status-info">›</span>
      <span>{text}</span>
    </div>
  );
}
