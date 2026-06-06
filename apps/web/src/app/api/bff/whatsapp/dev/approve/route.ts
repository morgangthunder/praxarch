import { NextRequest, NextResponse } from "next/server";

/**
 * BFF proxy -> NestJS dev approve. Stands in for an inbound WhatsApp reply so the
 * promote/publish -> approve -> execute loop is demoable locally. The gateway
 * hard-gates this to AUTH_PROVIDER=none.
 */
export async function POST(req: NextRequest) {
  const apiBase = process.env.API_BASE_URL;
  if (!apiBase) {
    return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const tenant = req.headers.get("x-praxarch-tenant") ?? "acme";

  const res = await fetch(`${apiBase}/whatsapp/dev/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-praxarch-tenant": tenant },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
