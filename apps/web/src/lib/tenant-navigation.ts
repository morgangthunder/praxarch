/** Persist the active workspace so admin "Back to …" and the assistant use the right tenant. */
export function rememberActiveTenant(slug: string, name: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("praxarch_active_tenant", JSON.stringify({ slug, name }));
}
