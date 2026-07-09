/** Extract a user-visible message from a BFF/API JSON error payload. */
export function parseApiError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const d = data as Record<string, unknown>;

  if (Array.isArray(d.message)) {
    return d.message.map(String).join("; ");
  }
  if (typeof d.message === "string" && d.message.length > 0) {
    if (typeof d.detail === "string" && d.detail.length > 0 && d.detail.length < 280) {
      if (d.message === "Coolify API request failed") {
        try {
          const upstream = JSON.parse(d.detail) as { message?: string };
          if (upstream.message) return upstream.message;
        } catch {
          return d.detail;
        }
      }
      return `${d.message}: ${d.detail}`;
    }
    return d.message;
  }

  if (typeof d.error === "string") return d.error;
  return fallback;
}
