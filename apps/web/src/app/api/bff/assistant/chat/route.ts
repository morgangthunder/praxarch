import { NextRequest } from "next/server";

/**
 * BFF streaming proxy -> NestJS assistant chat (Server-Sent Events).
 *
 * Pipes the upstream SSE body straight back to the browser. Forwards the active
 * tenant header (resolved by the gateway under AUTH_PROVIDER=none) and the
 * session token if present. No model keys ever touch the client.
 */
export async function POST(req: NextRequest) {
  const apiBase = process.env.API_BASE_URL;
  if (!apiBase) {
    return new Response("API_BASE_URL not configured", { status: 500 });
  }

  const body = await req.text();
  const tenant = req.headers.get("x-praxarch-tenant") ?? "acme";
  const sessionToken = req.cookies.get("praxarch_session")?.value;

  const upstream = await fetch(`${apiBase}/assistant/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-praxarch-tenant": tenant,
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body,
    cache: "no-store",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
