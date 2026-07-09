import { NextRequest, NextResponse } from "next/server";

const apiBase = () => process.env.API_BASE_URL;

function tenantHeader(req: NextRequest): Record<string, string> {
  const t = req.headers.get("x-praxarch-tenant");
  return t ? { "x-praxarch-tenant": t } : {};
}

/** Stopping/removing containers over SSH can take a moment. */
const RECONCILE_TIMEOUT_MS = 120_000;

/** POST → consent-gated server reconciliation (stop legacy containers, set proxy none). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  const base = apiBase();
  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });

  const { uuid } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${base}/cicd/coolify/servers/${encodeURIComponent(uuid)}/reconcile`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...tenantHeader(req) },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(RECONCILE_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
