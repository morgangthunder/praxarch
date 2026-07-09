import { NextRequest, NextResponse } from "next/server";

const apiBase = () => process.env.API_BASE_URL;

function tenantHeader(req: NextRequest): Record<string, string> {
  const t = req.headers.get("x-praxarch-tenant");
  return t ? { "x-praxarch-tenant": t } : {};
}

/** Long-running Coolify SSH/Docker checks (register + validate). */
const COOLIFY_VALIDATION_TIMEOUT_MS = 200_000;

/** POST → validate server SSH/Docker access (wizard gate). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  const base = apiBase();
  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });

  const { uuid } = await params;
  const res = await fetch(`${base}/cicd/coolify/servers/${encodeURIComponent(uuid)}/validate`, {
    method: "POST",
    headers: { ...tenantHeader(req) },
    cache: "no-store",
    signal: AbortSignal.timeout(COOLIFY_VALIDATION_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
