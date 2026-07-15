export type CiReadinessState = "ready" | "skipped" | "blocked";

export type CiReadiness = {
  state: CiReadinessState;
  reason?: "in_progress" | "not_started" | "failed" | "no_workflow" | "no_github_token" | "check_failed";
  message?: string;
  runUrl?: string;
  shortSha?: string;
  branch?: string;
};

/** Gate passed to deploy buttons — loading until the first CI check completes. */
export type CiGate = "loading" | CiReadiness;

export async function fetchCiReadiness(
  tenantSlug: string,
  serviceId: string,
  environment: "staging" | "production",
  ref?: string
): Promise<CiReadiness> {
  const qs = new URLSearchParams({ environment });
  if (ref) qs.set("ref", ref);
  const url = `/api/bff/cicd/services/${encodeURIComponent(serviceId)}/ci-readiness?${qs}`;
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "x-praxarch-tenant": tenantSlug },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<CiReadiness>;
      if (
        res.ok &&
        (data.state === "ready" || data.state === "blocked" || data.state === "skipped")
      ) {
        return data as CiReadiness;
      }
    } catch {
      /* retry */
    }
    if (attempt < maxAttempts - 1) {
      await sleep(600 * (attempt + 1));
    }
  }

  return {
    state: "blocked",
    reason: "check_failed",
    message:
      "Could not verify CI build status with GitHub. Deploy is paused until the check succeeds — try refreshing in a moment.",
  };
}

export function ciAllowsDeploy(gate: CiGate): boolean {
  if (gate === "loading") return false;
  return gate.state === "ready" || gate.state === "skipped";
}

export function ciGateLabel(gate: CiGate): string {
  if (gate === "loading") {
    return "Checking CI build status with GitHub…";
  }
  const msg = (gate.message ?? "").replace(/\*\*/g, "");
  if (gate.reason === "in_progress") return `CI in progress — ${msg}`;
  if (gate.reason === "not_started") return `CI not ready — ${msg}`;
  if (gate.reason === "failed") return `CI failed — ${msg}`;
  if (gate.reason === "check_failed") return msg;
  return msg;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
