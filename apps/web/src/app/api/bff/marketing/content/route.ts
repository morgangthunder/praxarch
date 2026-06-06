import { NextRequest, NextResponse } from "next/server";

const apiBase = () => process.env.API_BASE_URL;
const tenantHeader = (req: NextRequest): Record<string, string> => {
  const t = req.headers.get("x-praxarch-tenant");
  return t ? { "x-praxarch-tenant": t } : {};
};

/** GET → list content drafts for the active tenant. */
export async function GET(req: NextRequest) {
  const base = apiBase();
  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });
  const res = await fetch(`${base}/marketing/content`, {
    headers: { ...tenantHeader(req) },
    next: { revalidate: 30 },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

/** POST → generate / create a draft. */
export async function POST(req: NextRequest) {
  const base = apiBase();
  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${base}/marketing/content`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...tenantHeader(req) },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
