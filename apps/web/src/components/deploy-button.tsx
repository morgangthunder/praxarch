"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import type { AgentStatus } from "@/lib/types";
import { parseApiError } from "@/lib/parse-api-error";

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
      const data = (await res.json().catch(() => ({}))) as {
        deploymentId?: string;
      };
      if (!res.ok) {
        throw new Error(parseApiError(data, `Deploy did not start (${res.status})`));
      }
      if (!data.deploymentId) {
        throw new Error("Deploy did not start — no deployment id returned.");
      }
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
        <span
          className={`flex items-center gap-1.5 text-xs ${
            state === "error" ? "text-status-error" : "text-content-muted"
          }`}
        >
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
