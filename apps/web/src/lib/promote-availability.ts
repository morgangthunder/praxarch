import type { ServiceEnvironment } from "@/lib/types";

function normalizeCommit(commit: string | undefined): string | null {
  const c = (commit ?? "").trim().toLowerCase();
  if (!c || c === "—" || c === "head") return null;
  return c.replace(/[^a-f0-9]/g, "").slice(0, 7) || null;
}

/** Staging can be promoted when commits differ or production is in a failed state. */
export function isPromoteAvailable(
  staging?: ServiceEnvironment,
  prod?: ServiceEnvironment
): boolean {
  if (!staging) return false;
  if (prod?.status === "error") return true;
  if (staging.aheadOfProd) return true;
  const sc = normalizeCommit(staging.commit);
  const pc = normalizeCommit(prod?.commit);
  return sc != null && pc != null && sc !== pc;
}

export function productionStatusHint(
  staging?: ServiceEnvironment,
  prod?: ServiceEnvironment
): string {
  if (isPromoteAvailable(staging, prod)) return "";
  if (prod?.status === "error") {
    return "Production deploy failed — promote staging to recover.";
  }
  return "Production is up to date.";
}
