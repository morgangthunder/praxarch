import { StatusDot } from "@/components/ui/status-dot";
import type { AgentStatus } from "@/lib/types";
import { formatDeployTimestamp } from "@/lib/utils";

export interface DeployRunRow {
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

export function DeployActivityList({
  runs,
  serviceName,
}: {
  runs: DeployRunRow[];
  serviceName: (serviceId: string | null) => string;
}) {
  return (
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
  );
}

function runStatusToAgent(status: DeployRunRow["status"]): AgentStatus {
  if (status === "success") return "active";
  if (status === "failed") return "error";
  return "pending";
}
