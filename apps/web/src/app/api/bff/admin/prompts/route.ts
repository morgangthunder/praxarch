import { NextRequest, NextResponse } from "next/server";

const apiBase = () => process.env.API_BASE_URL;

/** Admin pages aren't tenant-scoped; default a tenant so the operator role resolves. */
function tenantHeader(req: NextRequest): Record<string, string> {
  return { "x-praxarch-tenant": req.headers.get("x-praxarch-tenant") ?? "acme" };
}

/** GET → list platform assistant prompts (guardrails + persona + agents). */
export async function GET(req: NextRequest) {
  const base = apiBase();
  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });

  const scope = req.nextUrl.searchParams.get("scope");
  const url = scope ? `${base}/admin/prompts?scope=${encodeURIComponent(scope)}` : `${base}/admin/prompts`;
  const res = await fetch(url, {
    headers: { ...tenantHeader(req) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

/** POST → create a custom prompt (optionally duplicated from an existing key). */
export async function POST(req: NextRequest) {
  const base = apiBase();
  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${base}/admin/prompts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...tenantHeader(req) },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
