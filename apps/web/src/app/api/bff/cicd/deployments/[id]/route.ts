import { NextRequest, NextResponse } from "next/server";

function tenantHeader(req: NextRequest): Record<string, string> {
  const t = req.headers.get("x-praxarch-tenant") ?? req.nextUrl.searchParams.get("tenant");
  return t ? { "x-praxarch-tenant": t } : {};
}

/** GET → current deploy run status. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiBase = process.env.API_BASE_URL;
  if (!apiBase) {
    return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });
  }

  const { id } = await params;
  const res = await fetch(`${apiBase}/cicd/deployments/${encodeURIComponent(id)}`, {
    headers: { ...tenantHeader(req) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
