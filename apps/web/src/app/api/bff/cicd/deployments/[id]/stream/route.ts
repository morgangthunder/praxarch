import { NextRequest } from "next/server";

function tenantHeader(req: NextRequest): Record<string, string> {
  const t = req.headers.get("x-praxarch-tenant") ?? req.nextUrl.searchParams.get("tenant");
  return t ? { "x-praxarch-tenant": t } : {};
}

/** GET → SSE proxy for live deploy status. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiBase = process.env.API_BASE_URL;
  if (!apiBase) {
    return new Response("API_BASE_URL not configured", { status: 500 });
  }

  const { id } = await params;
  const upstream = await fetch(
    `${apiBase}/cicd/deployments/${encodeURIComponent(id)}/stream`,
    {
      headers: { ...tenantHeader(req) },
      cache: "no-store",
    }
  );

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(text || "Upstream error", { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
