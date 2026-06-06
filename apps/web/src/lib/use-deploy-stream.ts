"use client";

import { useEffect, useState } from "react";

export type DeployRunStatus = "queued" | "building" | "success" | "failed";

export interface DeployRunSnapshot {
  id: string;
  status: DeployRunStatus;
  tag: string;
  commitSha: string | null;
  errorMessage: string | null;
  environment: "staging" | "production";
}

const STATUS_LABEL: Record<DeployRunStatus, string> = {
  queued: "Queued",
  building: "Building…",
  success: "Deployed",
  failed: "Failed",
};

/** Subscribe to live deploy status via the BFF SSE proxy. */
export function useDeployStream(
  deploymentId: string | null,
  tenantSlug: string
): { run: DeployRunSnapshot | null; label: string; done: boolean } {
  const [run, setRun] = useState<DeployRunSnapshot | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!deploymentId) {
      setRun(null);
      setDone(false);
      return;
    }

    setDone(false);
    const q = tenantSlug ? `?tenant=${encodeURIComponent(tenantSlug)}` : "";
    const url = `/api/bff/cicd/deployments/${encodeURIComponent(deploymentId)}/stream${q}`;
    const es = new EventSource(url);

    es.onmessage = (ev) => {
      try {
        const frame = JSON.parse(ev.data) as {
          type: string;
          run?: {
            id: string;
            status: DeployRunStatus;
            tag: string;
            commitSha: string | null;
            errorMessage: string | null;
            environment: "staging" | "production";
          };
        };
        if (frame.run) {
          setRun({
            id: frame.run.id,
            status: frame.run.status,
            tag: frame.run.tag,
            commitSha: frame.run.commitSha,
            errorMessage: frame.run.errorMessage,
            environment: frame.run.environment,
          });
        }
        if (frame.type === "done") setDone(true);
      } catch {
        /* ignore malformed frames */
      }
    };

    es.onerror = () => {
      es.close();
      setDone(true);
    };

    return () => es.close();
  }, [deploymentId, tenantSlug]);

  const label = run ? STATUS_LABEL[run.status] : "";
  return { run, label, done };
}
