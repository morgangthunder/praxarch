"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { DeployActivityList, type DeployRunRow } from "@/components/deployments/deploy-activity-list";
import type { DeployService } from "@/lib/types";
import { clientGet } from "@/lib/client-api";

/** Full deploy activity history for a tenant workspace. */
export function DeployActivityHistory({ tenantSlug }: { tenantSlug: string }) {
  const [services, setServices] = useState<DeployService[] | null>(null);
  const [runs, setRuns] = useState<DeployRunRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
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
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const serviceName = (serviceId: string | null) =>
    serviceId ? (services?.find((s) => s.id === serviceId)?.name ?? serviceId) : "—";

  return (
    <div className="space-y-4">
      <Link
        href={`/app/${tenantSlug}/deployments`}
        className="inline-flex items-center gap-1.5 text-sm text-content-muted transition-colors hover:text-content-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to deployments
      </Link>

      <Card>
        <CardBody>
          {loading ? (
            <p className="text-sm text-content-muted">Loading activity…</p>
          ) : !runs?.length ? (
            <p className="text-sm text-content-muted">
              No deploy activity yet for this workspace. Activity appears here after your first staging
              deploy.
            </p>
          ) : (
            <>
              <p className="mb-4 text-xs text-content-muted">
                Showing {runs.length} recent deploy{runs.length === 1 ? "" : "s"} for this workspace.
              </p>
              <DeployActivityList runs={runs} serviceName={serviceName} />
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
