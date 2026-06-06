import { cache } from "react";

const DEFAULT_TIMEOUT_MS = 2_000;

type ApiGetOptions = {
  /** Next.js fetch revalidation window (seconds). Omit for no-store. */
  revalidate?: number;
  timeoutMs?: number;
};

/**
 * Server-side API client. Used by Server Components / Route Handlers.
 *
 * Prefer client-side `clientGet` for module list reads so pages paint instantly.
 * When used on the server, defaults to a 2s timeout and optional short revalidate.
 */
async function apiGetRaw<T>(
  path: string,
  tenant: string,
  opts?: ApiGetOptions
): Promise<T> {
  const base = process.env.API_BASE_URL;
  if (!base) throw new Error("API_BASE_URL not set");

  const revalidate = opts?.revalidate;
  const res = await fetch(`${base}${path}`, {
    headers: { "x-praxarch-tenant": tenant },
    ...(revalidate != null ? { next: { revalidate } } : { cache: "no-store" as const }),
    signal: AbortSignal.timeout(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`API ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

/** Deduped per-request on the server (React cache). */
export const apiGet = cache(apiGetRaw);
