"use client";



import { useEffect, useState } from "react";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

import { StatusDot } from "@/components/ui/status-dot";

import type { AgentStatus } from "@/lib/types";

import { clientGet } from "@/lib/client-api";

import type { DeployService } from "@/lib/types";

import { formatDeployTimestamp } from "@/lib/utils";



interface DeployRunRow {

  id: string;

  serviceId: string | null;

  environment: "staging" | "production";

  status: "queued" | "building" | "success" | "failed";

  tag: string;

  actor: string;

  driver: "simulate" | "coolify";

  commitSha: string | null;

  errorMessage: string | null;

  createdAt: string;

  updatedAt: string;

}



/**

 * Tenant-aware deployments sidebar — replaces static "CI/CD Connected" mock copy.

 */

export function DeploymentsInsights({ tenantSlug }: { tenantSlug: string }) {

  const [services, setServices] = useState<DeployService[] | null>(null);

  const [runs, setRuns] = useState<DeployRunRow[] | null>(null);

  const [loading, setLoading] = useState(true);



  useEffect(() => {

    let cancelled = false;

    setLoading(true);

    Promise.all([

      clientGet<DeployService[]>("/api/bff/cicd/services", tenantSlug, { skipCache: true }),

      clientGet<DeployRunRow[]>("/api/bff/cicd/deploy-runs", tenantSlug, { skipCache: true }),

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



  const count = services?.length ?? 0;

  const status: AgentStatus = loading ? "pending" : count > 0 ? "active" : "idle";

  const statusLabel = loading ? "Loading…" : count > 0 ? `${count} service${count === 1 ? "" : "s"}` : "No services";



  const serviceName = (serviceId: string | null) =>

    serviceId ? (services?.find((s) => s.id === serviceId)?.name ?? serviceId) : "—";



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

            <ul className="space-y-2.5">

              {runs.map((run) => (

                <li

                  key={run.id}

                  className="rounded-lg border border-border-subtle bg-surface-base px-2.5 py-2 text-xs"

                >

                  <div className="flex items-center justify-between gap-2">

                    <span className="font-medium text-content-primary">{serviceName(run.serviceId)}</span>

                    <StatusDot status={runStatusToAgent(run.status)} />

                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-content-muted">

                    <span className="capitalize">{run.environment}</span>

                    <span>·</span>

                    <span className="font-mono text-[10px]">{run.tag}</span>

                    <span>·</span>

                    <span>{formatDeployTimestamp(run.createdAt)}</span>

                  </div>

                  {run.status === "failed" && run.errorMessage && (

                    <p className="mt-1.5 line-clamp-2 text-[11px] text-status-error">{run.errorMessage}</p>

                  )}

                  {run.status === "success" && run.commitSha && (

                    <p className="mt-1 font-mono text-[10px] text-content-muted">{run.commitSha.slice(0, 7)}</p>

                  )}

                </li>

              ))}

            </ul>

          )}

        </CardBody>

      </Card>

    </div>

  );

}



function runStatusToAgent(status: DeployRunRow["status"]): AgentStatus {

  if (status === "success") return "active";

  if (status === "failed") return "error";

  return "pending";

}



function Row({ k, v }: { k: string; v: string }) {

  return (

    <div className="flex items-center justify-between gap-3">

      <span className="text-content-muted">{k}</span>

      <span className="text-right text-content-secondary">{v}</span>

    </div>

  );

}


