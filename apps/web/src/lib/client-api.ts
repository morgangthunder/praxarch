/**
 * Browser-side BFF client with a short in-memory cache.
 *
 * Module pages render sync mock data first, then hydrate from the BFF on mount.
 * Revisiting a module within the TTL reuses the cached response (no network wait).
 */

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 5_000;

interface CacheEntry {
  data: unknown;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(tenant: string, path: string): string {
  return `${tenant}:${path}`;
}

export function invalidateClientCache(tenant: string, path?: string): void {
  const prefix = path ? cacheKey(tenant, path) : `${tenant}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/**
 * GET from a BFF route. Returns null on failure/timeout so callers keep mock data.
 */
export async function clientGet<T>(
  path: string,
  tenant: string,
  opts?: { ttlMs?: number; timeoutMs?: number; skipCache?: boolean }
): Promise<T | null> {
  const key = cacheKey(tenant, path);
  const ttl = opts?.ttlMs ?? DEFAULT_TTL_MS;

  if (!opts?.skipCache) {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.data as T;
  }

  try {
    const res = await fetch(path, {
      headers: { "x-praxarch-tenant": tenant },
      signal: AbortSignal.timeout(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    cache.set(key, { data, expires: Date.now() + ttl });
    return data;
  } catch {
    return null;
  }
}
