"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { DeployActivityList, type DeployRunRow } from "@/components/deployments/deploy-activity-list";
import type { AgentStatus, DeployService } from "@/lib/types";
import { clientGet } from "@/lib/client-api";
import { DEPLOY_FINISHED } from "@/lib/deploy-events";

const COLLAPSED_RUN_LIMIT = 4;

/**
 * Tenant-aware deployments sidebar — replaces static "CI/CD Connected" mock copy.
 */
export function DeploymentsInsights({ tenantSlug }: { tenantSlug: string }) {
  const [services, setServices] = useState<DeployService[] | null>(null);
  const [runs, setRuns] = useState<DeployRunRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [activityExpanded, setActivityExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function loadActivity() {
      setLoading(true);
      Promise.all([
        clientGet<DeployService[]>("/api/bff/cicd/services", tenantSlug, {
          skipCache: true,
          timeoutMs: 25_000,
          retries: 2,
        }),
        clientGet<DeployRunRow[]>("/api/bff/cicd/deploy-runs", tenantSlug, {
          skipCache: true,
          timeoutMs: 25_000,
          retries: 2,
        }),
      ])
        .then(([svcData, runData]) => {
          if (cancelled) return;
          setServices(Array.isArray(svcData) ? svcData : []);
          setRuns(Array.isArray(runData) ? runData : []);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    loadActivity();

    function onDeployFinished(ev: Event) {
      const detail = (ev as CustomEvent<{ tenantSlug?: string }>).detail;
      if (detail?.tenantSlug && detail.tenantSlug !== tenantSlug) return;
      loadActivity();
    }

    window.addEventListener(DEPLOY_FINISHED, onDeployFinished);
    return () => {
      cancelled = true;
      window.removeEventListener(DEPLOY_FINISHED, onDeployFinished);
    };
  }, [tenantSlug]);

  const count = services?.length ?? 0;
  const status: AgentStatus = loading ? "pending" : count > 0 ? "active" : "idle";
  const statusLabel = loading ? "Loading…" : count > 0 ? `${count} service${count === 1 ? "" : "s"}` : "No services";

  const serviceName = (serviceId: string | null) =>
    serviceId ? (services?.find((s) => s.id === serviceId)?.name ?? serviceId) : "—";

  const visibleRuns =
    runs && !activityExpanded ? runs.slice(0, COLLAPSED_RUN_LIMIT) : (runs ?? []);
  const hasMoreRuns = (runs?.length ?? 0) > COLLAPSED_RUN_LIMIT;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>CI/CD</CardTitle>
          <StatusDot status={status} withLabel label={statusLabel} />
        </CardHeader>
        <CardBody className="space-y-2 text-sm">
          <Row k="Provider" v="Coolify" />
          <Row
            k="Workspace"
            v={count > 0 ? `${tenantSlug} · ${count} registered` : `${tenantSlug} · not provisioned`}
          />
          <Row k="Staging" v="Deploy from staging branch" />
          <Row k="Production" v="Promote when staging is ahead" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          {!loading && hasMoreRuns && (
            <button
              type="button"
              onClick={() => setActivityExpanded((v) => !v)}
              className="rounded p-0.5 text-content-muted transition-colors hover:text-content-primary"
              aria-label={activityExpanded ? "Show fewer activity items" : "Show all activity items"}
              aria-expanded={activityExpanded}
            >
              {activityExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </CardHeader>
        <CardBody>
          {loading ? (
            <p className="text-xs text-content-muted">Loading…</p>
          ) : !runs?.length ? (
            <p className="text-xs text-content-muted">
              No deploy activity yet for this workspace. Activity appears here after your first staging
              deploy.
            </p>
          ) : (
            <>
              <DeployActivityList runs={visibleRuns} serviceName={serviceName} />
              {hasMoreRuns && (
                <div className="mt-2.5 border-t border-border-subtle pt-2.5">
                  <Link
                    href={`/app/${tenantSlug}/deployments/activity`}
                    className="text-xs text-content-muted transition-colors hover:text-content-primary hover:underline"
                  >
                    more…
                  </Link>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-content-muted">{k}</span>
      <span className="text-right text-content-secondary">{v}</span>
    </div>
  );
}
