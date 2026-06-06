import { NextRequest, NextResponse } from "next/server";

/** BFF proxy -> NestJS capability invoke (typed dispatch from the UI). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiBase = process.env.API_BASE_URL;
  if (!apiBase) {
    return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const tenant = req.headers.get("x-praxarch-tenant") ?? "acme";
  const sessionToken = req.cookies.get("praxarch_session")?.value;

  const res = await fetch(`${apiBase}/capabilities/${encodeURIComponent(id)}/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-praxarch-tenant": tenant,
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
