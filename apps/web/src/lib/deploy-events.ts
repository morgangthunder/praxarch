export const DEPLOY_FINISHED = "praxarch:deploy-finished";

export function emitDeployFinished(tenantSlug: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DEPLOY_FINISHED, { detail: { tenantSlug } }));
}
