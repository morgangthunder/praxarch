export type CiReadinessState = "ready" | "skipped" | "blocked";

export type CiReadiness = {
  state: CiReadinessState;
  reason?: "in_progress" | "not_started" | "failed" | "no_workflow" | "no_github_token";
  message?: string;
  runUrl?: string;
  shortSha?: string;
  branch?: string;
};

export async function fetchCiReadiness(
  tenantSlug: string,
  serviceId: string,
  environment: "staging" | "production",
  ref?: string
): Promise<CiReadiness> {
  const qs = new URLSearchParams({ environment });
  if (ref) qs.set("ref", ref);
  const res = await fetch(
    `/api/bff/cicd/services/${encodeURIComponent(serviceId)}/ci-readiness?${qs}`,
    {
      headers: { "x-praxarch-tenant": tenantSlug },
      cache: "no-store",
    }
  );
  return (await res.json().catch(() => ({ state: "skipped" }))) as CiReadiness;
}
