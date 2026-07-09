import { NextRequest, NextResponse } from "next/server";

const apiBase = () => process.env.API_BASE_URL;

function tenantHeader(req: NextRequest): Record<string, string> {
  const t = req.headers.get("x-praxarch-tenant");
  return t ? { "x-praxarch-tenant": t } : {};
}

/** GET → list services for the active tenant. */
export async function GET(req: NextRequest) {
  const base = apiBase();
  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });

  const res = await fetch(`${base}/cicd/services`, {
    headers: { ...tenantHeader(req) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

/** POST → create a new deployment (wizard). */
export async function POST(req: NextRequest) {
  const base = apiBase();
  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${base}/cicd/services`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...tenantHeader(req) },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
