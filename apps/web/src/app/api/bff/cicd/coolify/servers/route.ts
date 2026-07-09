import { NextRequest, NextResponse } from "next/server";

const apiBase = () => process.env.API_BASE_URL;

/** Long-running Coolify SSH/Docker checks (register + validate). */
const COOLIFY_VALIDATION_TIMEOUT_MS = 200_000;

function tenantHeader(req: NextRequest): Record<string, string> {
  const t = req.headers.get("x-praxarch-tenant");
  return t ? { "x-praxarch-tenant": t } : {};
}

/** GET → list deployment servers (tenant EC2 + platform localhost). */
export async function GET(req: NextRequest) {
  const base = apiBase();
  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });

  const res = await fetch(`${base}/cicd/coolify/servers`, {
    headers: { ...tenantHeader(req) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

/** POST → register an EC2 / remote server with Coolify. */
export async function POST(req: NextRequest) {
  const base = apiBase();
  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${base}/cicd/coolify/servers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...tenantHeader(req) },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(COOLIFY_VALIDATION_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
