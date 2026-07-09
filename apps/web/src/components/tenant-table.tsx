import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { TenantTableLink } from "@/components/admin/tenant-table-link";
import { formatCurrency } from "@/lib/utils";
import type { Tenant } from "@/lib/types";

const AUTONOMY_LABEL: Record<Tenant["autonomy"], string> = {
  FULLY_AUTONOMOUS: "Autonomous",
  APPROVAL_REQUIRED: "Approval",
  PAUSED: "Paused",
};

/** Dense, scannable tenant roster for the Super-Admin Control Center. */
export function TenantTable({ tenants }: { tenants: Tenant[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tenants</CardTitle>
        <span className="text-xs text-content-muted">{tenants.length} active</span>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-border-subtle text-left text-[11px] uppercase tracking-wide text-content-muted">
              <th className="px-4 py-2 font-medium">Client</th>
              <th className="px-4 py-2 font-medium">Autonomy</th>
              <th className="px-4 py-2 font-medium">Agents</th>
              <th className="px-4 py-2 text-right font-medium">Ad spend</th>
              <th className="px-4 py-2 text-right font-medium">Margin</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr
                key={t.id}
                className="border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-overlay"
              >
                <td className="px-4 py-2.5">
                  <TenantTableLink tenant={t} />
                </td>
                <td className="px-4 py-2.5 text-content-secondary">{AUTONOMY_LABEL[t.autonomy]}</td>
                <td className="px-4 py-2.5 font-mono text-content-secondary">{t.activeAgents}</td>
                <td className="px-4 py-2.5 text-right font-mono text-content-secondary">
                  {formatCurrency(t.monthlySpendEur)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span
                    className={
                      t.marginPct >= 55 ? "font-mono text-status-active" : "font-mono text-status-pending"
                    }
                  >
                    {t.marginPct}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
