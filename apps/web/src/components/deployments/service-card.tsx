"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, AppWindow, MessageCircle, Settings2, Wand2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { useWorkspace } from "@/components/workspace-context";
import { useDeployStream, type DeployRunStatus } from "@/lib/use-deploy-stream";
import { fetchCiReadiness, ciAllowsDeploy, ciGateLabel, type CiGate } from "@/lib/ci-readiness";
import { isPromoteAvailable, productionStatusHint } from "@/lib/promote-availability";
import { emitDeployFinished } from "@/lib/deploy-events";
import { invalidateClientCache } from "@/lib/client-api";
import type { AgentStatus, DeployEnvironment, DeployService, ServiceEnvironment } from "@/lib/types";
import { formatDeployTimestamp } from "@/lib/utils";
import { parseApiError } from "@/lib/parse-api-error";

type ActionState = { kind: "idle" | "busy" | "done" | "error" | "requested"; msg?: string };

function runStatusToAgent(status: DeployRunStatus): AgentStatus {
  if (status === "success") return "active";
  if (status === "failed") return "error";
  return "pending";
}

function ciBlocksDeploy(gate: CiGate): boolean {
  return !ciAllowsDeploy(gate);
}

/**
 * One deployable service with live deploy status streaming (Gate 1.1).
 */
export function ServiceCard({
  service,
  tenantSlug,
  onConfigure,
  onManageDeployment,
  onServiceUpdate,
}: {
  service: DeployService;
  tenantSlug: string;
  onConfigure?: () => void;
  onManageDeployment?: () => void;
  onServiceUpdate?: (updated: DeployService) => void;
}) {
  const { can } = useWorkspace();
  const [state, setState] = useState<ActionState>({ kind: "idle" });
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [activeEnv, setActiveEnv] = useState<DeployEnvironment | null>(null);
  const [localService, setLocalService] = useState(service);
  const [ciStaging, setCiStaging] = useState<CiGate>("loading");
  const [ciProduction, setCiProduction] = useState<CiGate>("loading");

  const { run, label, done } = useDeployStream(deploymentId, tenantSlug);
  const finalizedRunId = useRef<string | null>(null);

  useEffect(() => {
    setLocalService(service);
  }, [service]);

  const mayDeploy = can("deploy");
  const mayPromote = can("promote_prod");

  useEffect(() => {
    if (!mayDeploy && !mayPromote) return;
    let cancelled = false;

    async function pollCi() {
      try {
        const [stagingCi, prodCi] = await Promise.all([
          fetchCiReadiness(tenantSlug, localService.id, "staging"),
          fetchCiReadiness(tenantSlug, localService.id, "production"),
        ]);
        if (cancelled) return;
        setCiStaging(stagingCi);
        setCiProduction(prodCi);
      } catch {
        if (!cancelled) {
          const failed: CiGate = {
            state: "blocked",
            reason: "check_failed",
            message:
              "Could not verify CI build status with GitHub. Deploy is paused until the check succeeds.",
          };
          setCiStaging(failed);
          setCiProduction(failed);
        }
      }
    }

    pollCi();
    const timer = setInterval(pollCi, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [localService.id, tenantSlug, mayDeploy, mayPromote]);

  const prod = localService.environments.find((e) => e.environment === "production");
  const staging = localService.environments.find((e) => e.environment === "staging");
  const promoteAvailable = isPromoteAvailable(staging, prod);

  const displayEnvironments = useMemo(() => {
    if (!run || !activeEnv) return localService.environments;
    return localService.environments.map((e) => {
      if (e.environment !== activeEnv) return e;
      const agent = runStatusToAgent(run.status);
      return {
        ...e,
        status: agent,
        version: run.status === "success" ? (run.tag.startsWith("v") ? run.tag : `v${run.tag}`) : e.version,
        commit: run.commitSha?.slice(0, 7) ?? e.commit,
        deployedAt: run.status === "success" ? new Date().toISOString() : e.deployedAt,
      };
    });
  }, [localService.environments, run, activeEnv]);

  useEffect(() => {
    if (!run || !done || !activeEnv) return;
    if (finalizedRunId.current === run.id) return;
    finalizedRunId.current = run.id;

    setLocalService((prev) => {
      const updatedEnvs = prev.environments.map((e) => {
        if (e.environment !== activeEnv) {
          if (run.status === "success" && activeEnv === "production" && e.environment === "staging") {
            return { ...e, aheadOfProd: false };
          }
          return e;
        }
        if (run.status === "success") {
          return {
            ...e,
            status: "active" as AgentStatus,
            version: run.tag.startsWith("v") ? run.tag : `v${run.tag}`,
            commit: run.commitSha?.slice(0, 7) ?? e.commit,
            deployedAt: new Date().toISOString(),
            aheadOfProd: activeEnv === "staging" ? true : undefined,
          };
        }
        if (run.status === "failed") {
          return { ...e, status: "error" as AgentStatus };
        }
        return e;
      });
      const stagingEnv = updatedEnvs.find((e) => e.environment === "staging");
      const prodEnv = updatedEnvs.find((e) => e.environment === "production");
      const finalEnvs = updatedEnvs.map((e) =>
        e.environment === "staging"
          ? { ...e, aheadOfProd: isPromoteAvailable(stagingEnv, prodEnv) || undefined }
          : e
      );
      const updated = { ...prev, environments: finalEnvs };
      onServiceUpdate?.(updated);
      return updated;
    });

    if (run.status === "success") {
      const envLabel = activeEnv === "production" ? "Production" : "Staging";
      setState({ kind: "done", msg: `${envLabel} deployed` });
    } else if (run.status === "failed") {
      const envLabel = activeEnv === "production" ? "Production" : "Staging";
      setState({ kind: "error", msg: run.errorMessage ?? `${envLabel} deploy failed` });
    }
    invalidateClientCache(tenantSlug, "/api/bff/cicd/deploy-runs");
    invalidateClientCache(tenantSlug, "/api/bff/cicd/services");
    emitDeployFinished(tenantSlug);
    setDeploymentId(null);
    setActiveEnv(null);
  }, [done, run, activeEnv, onServiceUpdate, tenantSlug]);

  async function deploy(environment: DeployEnvironment, ref?: string) {
    const ciGate =
      environment === "staging"
        ? ciStaging
        : ref && ref !== prod?.branch
          ? ciStaging
          : ciProduction;
    if (ciBlocksDeploy(ciGate)) {
      setState({ kind: "error", msg: ciGateLabel(ciGate) });
      return;
    }

    setState({ kind: "busy", msg: environment === "production" ? "Deploying production…" : "Deploying…" });
    setActiveEnv(environment);
    try {
      const res = await fetch("/api/bff/cicd/deploy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-praxarch-tenant": tenantSlug,
        },
        body: JSON.stringify({
          project: `${tenantSlug}-${localService.id}`,
          environment,
          serviceId: localService.id,
          ...(ref ? { ref } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        deploymentId?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(
          parseApiError(data, `Deploy did not start (${res.status})`)
        );
      }
      if (!data.deploymentId) {
        throw new Error("Deploy did not start — no deployment id returned.");
      }
      setDeploymentId(data.deploymentId);
      setState({ kind: "busy", msg: "Starting…" });
    } catch (err) {
      setActiveEnv(null);
      setState({
        kind: "error",
        msg: err instanceof Error ? err.message : "Deploy did not start",
      });
    }
  }

  async function requestApproval() {
    setState({ kind: "busy", msg: "Requesting approval…" });
    try {
      const res = await fetch("/api/bff/cicd/promote-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-praxarch-tenant": tenantSlug,
        },
        body: JSON.stringify({
          project: `${tenantSlug}-${localService.id}`,
          environment: "production",
          serviceId: localService.id,
          summary: `Promote ${localService.name} to production`,
        }),
      });
      if (!res.ok) throw new Error(`Request rejected (${res.status})`);
      await res.json().catch(() => ({}));
      setState({ kind: "requested", msg: "Approval requested via WhatsApp" });
    } catch (err) {
      setState({ kind: "error", msg: err instanceof Error ? err.message : "Request failed" });
    }
  }

  const Icon = localService.kind === "app" ? AppWindow : Boxes;
  const prodRow = displayEnvironments.find((e) => e.environment === "production");
  const stagingRow = displayEnvironments.find((e) => e.environment === "staging");

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-content-muted" />
          <span className="font-medium text-content-primary">{localService.name}</span>
          <span className="rounded border border-border-subtle bg-surface-base px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-content-muted">
            {localService.kind}
          </span>
          <span className="ml-auto font-mono text-[11px] text-content-muted">{localService.repo}</span>
          {onManageDeployment && (
            <button
              onClick={onManageDeployment}
              title="Manage deployment setup (wizard)"
              className="rounded-md p-1 text-content-muted transition-colors hover:bg-surface-base hover:text-content-secondary"
            >
              <Wand2 className="h-3.5 w-3.5" />
            </button>
          )}
          {onConfigure && (
            <button
              onClick={onConfigure}
              title="Configure CI/CD for this service"
              className="rounded-md p-1 text-content-muted transition-colors hover:bg-surface-base hover:text-content-secondary"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          {prodRow && <EnvRow env={prodRow} />}
          {stagingRow && <EnvRow env={stagingRow} />}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
          {state.kind === "error" && state.msg && (
            <p className="w-full rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
              {state.msg}
            </p>
          )}

          {(ciBlocksDeploy(ciStaging) || ciBlocksDeploy(ciProduction)) && (() => {
            const blockingGate = ciBlocksDeploy(ciStaging) ? ciStaging : ciProduction;
            return (
            <p className="w-full rounded-lg border border-status-pending/30 bg-status-pending/10 px-3 py-2 text-xs text-status-pending">
              {ciGateLabel(blockingGate)}
              {blockingGate !== "loading" && blockingGate.runUrl ? (
                <>
                  {" "}
                  <a
                    href={blockingGate.runUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    View CI run
                  </a>
                </>
              ) : null}
            </p>
            );
          })()}

          {can("deploy") && staging && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => deploy("staging")}
              disabled={state.kind === "busy" || ciBlocksDeploy(ciStaging)}
              title={ciBlocksDeploy(ciStaging) ? ciGateLabel(ciStaging) : undefined}
            >
              Deploy staging
            </Button>
          )}

          {can("promote_prod") && prodRow && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => deploy("production", prodRow.branch)}
              disabled={state.kind === "busy" || ciBlocksDeploy(ciProduction)}
              title={ciBlocksDeploy(ciProduction) ? ciGateLabel(ciProduction) : undefined}
            >
              Deploy production
            </Button>
          )}

          {promoteAvailable ? (
            can("promote_prod") ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => deploy("production", stagingRow?.branch)}
                disabled={state.kind === "busy" || ciBlocksDeploy(ciStaging)}
                title={ciBlocksDeploy(ciStaging) ? ciGateLabel(ciStaging) : undefined}
              >
                Promote Staging to Production
              </Button>
            ) : can("deploy") ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={requestApproval}
                disabled={state.kind === "requested"}
              >
                <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                Request prod via WhatsApp
              </Button>
            ) : null
          ) : (
            <span
              className={`text-xs ${prodRow?.status === "error" ? "text-status-error" : "text-content-muted"}`}
            >
              {productionStatusHint(stagingRow, prodRow)}
            </span>
          )}

          {state.kind !== "idle" && (
            <span
              className={`ml-auto flex items-center gap-1.5 text-xs ${
                state.kind === "error" ? "text-status-error" : "text-content-muted"
              }`}
            >
              <StatusDot
                status={
                  run
                    ? runStatusToAgent(run.status)
                    : state.kind === "done"
                      ? "active"
                      : state.kind === "error"
                        ? "error"
                        : state.kind === "requested"
                          ? "pending"
                          : "info"
                }
              />
              {run ? label : state.msg}
            </span>
          )}

          {!can("deploy") && (
            <span className="text-xs text-content-muted">View-only — you can't deploy this service.</span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function EnvRow({ env }: { env: ServiceEnvironment }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-base px-3 py-2 text-sm">
      <span className="w-20 shrink-0 text-[11px] uppercase tracking-wide text-content-muted">
        {env.environment}
      </span>
      <StatusDot status={env.status} />
      <span className="font-mono text-content-secondary">{env.version}</span>
      <span className="truncate font-mono text-[11px] text-content-muted">
        {env.branch}@{env.commit}
      </span>
      {env.aheadOfProd && (
        <span className="rounded border border-status-info/40 bg-status-info/10 px-1.5 py-0.5 text-[10px] font-medium text-status-info">
          ahead
        </span>
      )}
      <span className="ml-auto shrink-0 text-[11px] text-content-muted">
        {formatDeployTimestamp(env.deployedAt)}
      </span>
    </div>
  );
}
