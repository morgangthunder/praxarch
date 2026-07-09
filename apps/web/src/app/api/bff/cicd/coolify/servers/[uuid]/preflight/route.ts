import { NextRequest, NextResponse } from "next/server";

const apiBase = () => process.env.API_BASE_URL;

function tenantHeader(req: NextRequest): Record<string, string> {
  const t = req.headers.get("x-praxarch-tenant");
  return t ? { "x-praxarch-tenant": t } : {};
}

/** SSH scan can take a while on first connect. */
const PREFLIGHT_TIMEOUT_MS = 90_000;

/** POST → read-only server preflight scan (takeover conflict report). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  const base = apiBase();
  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });

  const { uuid } = await params;
  const res = await fetch(`${base}/cicd/coolify/servers/${encodeURIComponent(uuid)}/preflight`, {
    method: "POST",
    headers: { ...tenantHeader(req) },
    cache: "no-store",
    signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
