import { NextRequest, NextResponse } from "next/server";

const apiBase = () => process.env.API_BASE_URL;

function tenantHeader(req: NextRequest): Record<string, string> {
  return { "x-praxarch-tenant": req.headers.get("x-praxarch-tenant") ?? "acme" };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ caseKey: string }> }) {
  const base = apiBase();
  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });
  const { caseKey } = await params;

  const res = await fetch(`${base}/admin/ai-cases/${encodeURIComponent(caseKey)}`, {
    headers: { ...tenantHeader(req) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ caseKey: string }> }) {
  const base = apiBase();
  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });
  const { caseKey } = await params;
  const body = await req.json().catch(() => ({}));

  const res = await fetch(`${base}/admin/ai-cases/${encodeURIComponent(caseKey)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...tenantHeader(req) },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
