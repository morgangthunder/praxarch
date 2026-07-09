"use client";

import { useEffect, useRef, useState } from "react";

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

const TERMINAL: DeployRunStatus[] = ["success", "failed"];

function applyRun(
  setRun: (r: DeployRunSnapshot) => void,
  setDone: (d: boolean) => void,
  raw: DeployRunSnapshot
) {
  setRun(raw);
  if (TERMINAL.includes(raw.status)) setDone(true);
}

/** Subscribe to live deploy status via SSE with HTTP polling fallback. */
export function useDeployStream(
  deploymentId: string | null,
  tenantSlug: string
): { run: DeployRunSnapshot | null; label: string; done: boolean } {
  const [run, setRun] = useState<DeployRunSnapshot | null>(null);
  const [done, setDone] = useState(false);
  const sseFailed = useRef(false);

  useEffect(() => {
    if (!deploymentId) {
      setRun(null);
      setDone(false);
      sseFailed.current = false;
      return;
    }

    setDone(false);
    sseFailed.current = false;
    const q = tenantSlug ? `?tenant=${encodeURIComponent(tenantSlug)}` : "";
    const pollUrl = `/api/bff/cicd/deployments/${encodeURIComponent(deploymentId)}${q}`;
    const streamUrl = `/api/bff/cicd/deployments/${encodeURIComponent(deploymentId)}/stream${q}`;

    const pollOnce = async () => {
      try {
        const res = await fetch(pollUrl, {
          headers: tenantSlug ? { "x-praxarch-tenant": tenantSlug } : {},
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as DeployRunSnapshot;
        applyRun(setRun, setDone, data);
      } catch {
        /* ignore transient poll errors */
      }
    };

    const pollTimer = setInterval(() => {
      void pollOnce();
    }, 4000);

    void pollOnce();

    const es = new EventSource(streamUrl);

    es.onmessage = (ev) => {
      try {
        const frame = JSON.parse(ev.data) as {
          type: string;
          run?: DeployRunSnapshot;
        };
        if (frame.run) applyRun(setRun, setDone, frame.run);
        if (frame.type === "done") setDone(true);
      } catch {
        /* ignore malformed frames */
      }
    };

    es.onerror = () => {
      sseFailed.current = true;
      es.close();
      void pollOnce();
    };

    return () => {
      clearInterval(pollTimer);
      es.close();
    };
  }, [deploymentId, tenantSlug]);

  const label = run
    ? run.status === "failed" && run.errorMessage
      ? run.errorMessage
      : STATUS_LABEL[run.status]
    : "";
  return { run, label, done };
}
