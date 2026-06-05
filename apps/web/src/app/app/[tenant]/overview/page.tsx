import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import {
  getPendingActions,
  getTenant,
  MOCK_AUTOMATIONS,
  MOCK_CAMPAIGNS,
  MOCK_CREDITS_USED,
  MOCK_DEPLOYMENTS,
  MOCK_FINANCE,
} from "@/lib/mock-data";
import { MODULE_BY_KEY, PLANS, hasModuleAccess } from "@/lib/modules";
import { formatCurrency } from "@/lib/utils";

/**
 * Tenant Overview — the workspace home.
 * Cross-module high-level metrics (only for entitled modules) + a single
 * "needs your attention" feed aggregated across the whole business.
 */
export default async function OverviewPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = getTenant(slug);
  if (!tenant) notFound();

  const ent = tenant.entitlements;
  const allowance = PLANS[ent.tier].includedCreditsMonthly;
  const usedPct = Math.round((MOCK_CREDITS_USED / allowance) * 100);
  const actions = getPendingActions(tenant);

  const adSpend = MOCK_CAMPAIGNS.reduce((s, c) => s + c.spendEur, 0);
  const activeAutomations = MOCK_AUTOMATIONS.filter((a) => a.status === "active").length;
  const lastDeploy = MOCK_DEPLOYMENTS[0];

  // Metric tiles are filtered by entitlement so locked modules don't leak data.
  const tiles = [
    hasModuleAccess(ent, "acquisition") && {
      label: "Ad spend (mo)", value: formatCurrency(adSpend), status: "active" as const, href: "acquisition",
    },
    hasModuleAccess(ent, "automations") && {
      label: "Active automations", value: String(activeAutomations), status: "active" as const, href: "automations",
    },
    hasModuleAccess(ent, "deployments") && {
      label: "Last deploy", value: lastDeploy.environment, status: lastDeploy.status, href: "deployments",
    },
    hasModuleAccess(ent, "finances") && {
      label: "Runway", value: `${MOCK_FINANCE.runwayMonths} mo`, status: "info" as const, href: "finances",
    },
    {
      label: "Credits used", value: `${usedPct}%`, status: usedPct > 80 ? ("pending" as const) : ("info" as const), href: "account",
    },
  ].filter(Boolean) as { label: string; value: string; status: "active" | "pending" | "info" | "error" | "idle"; href: string }[];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={`Everything happening across ${tenant.name}.`}
        actions={<StatusDot status={tenant.status} withLabel />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.label} href={`/app/${slug}/${t.href}`}>
            <Card className="transition-colors hover:border-border-strong">
              <CardBody className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-content-muted">{t.label}</div>
                  <div className="mt-1 font-mono text-lg font-semibold capitalize text-content-primary">{t.value}</div>
                </div>
                <StatusDot status={t.status} />
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Needs your attention</CardTitle>
          <StatusDot status={actions.some((a) => a.severity === "error") ? "error" : "pending"} withLabel label={`${actions.length} items`} />
        </CardHeader>
        <div className="divide-y divide-border-subtle">
          {actions.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-content-muted">All clear — nothing pending.</p>
          )}
          {actions.map((a) => {
            const mod = MODULE_BY_KEY[a.module];
            return (
              <Link
                key={a.id}
                href={`/app/${slug}/${mod.path}`}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-overlay"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <StatusDot status={a.severity} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-content-primary">{a.label}</div>
                    <div className="truncate text-xs text-content-muted">{a.detail}</div>
                  </div>
                </div>
                <span className="shrink-0 rounded border border-border-subtle bg-surface-base px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-content-muted">
                  {mod.label}
                </span>
              </Link>
            );
          })}
        </div>
      </Card>
    </>
  );
}
