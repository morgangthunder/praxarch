"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import type { AgentStatus } from "@/lib/types";

type DeployState = "idle" | "deploying" | "success" | "error";

const STATE_TO_STATUS: Record<DeployState, AgentStatus> = {
  idle: "idle",
  deploying: "info",
  success: "active",
  error: "error",
};

/**
 * Phase 2 frontend trigger for the Coolify "One-Button Deploy".
 *
 * Calls the NestJS BFF (`POST /cicd/deploy`) — never Coolify directly. The BFF
 * holds the signing secret and performs the privileged tag + promote.
 */
export function DeployButton({
  environment = "production",
  project = "praxarch-web",
}: {
  environment?: "staging" | "production";
  project?: string;
}) {
  const [state, setState] = useState<DeployState>("idle");
  const [message, setMessage] = useState<string>("");

  async function deploy() {
    setState("deploying");
    setMessage("Tagging & promoting…");
    try {
      const res = await fetch("/api/bff/cicd/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, environment }),
      });
      if (!res.ok) throw new Error(`Deploy rejected (${res.status})`);
      const data = (await res.json()) as { deploymentId: string };
      setState("success");
      setMessage(`Triggered · ${data.deploymentId}`);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Deploy failed");
    }
  }

  return (
    <div className="flex items-center gap-2.5">
      {state !== "idle" && (
        <span className="flex items-center gap-1.5 text-xs text-content-muted">
          <StatusDot status={STATE_TO_STATUS[state]} />
          {message}
        </span>
      )}
      <Button
        variant={environment === "production" ? "primary" : "secondary"}
        size="sm"
        onClick={deploy}
        disabled={state === "deploying"}
      >
        {state === "deploying" ? "Deploying…" : `Deploy ${environment}`}
      </Button>
    </div>
  );
}
