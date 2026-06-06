import { NextRequest, NextResponse } from "next/server";

/**
 * BFF proxy → NestJS content publish-request.
 *
 * Forwards a content-publish request to the gateway, which opens a WhatsApp HITL
 * checkpoint; on approval the Marketing OS publishes via the resolved adapter.
 */
export async function POST(req: NextRequest) {
  const apiBase = process.env.API_BASE_URL;
  if (!apiBase) {
    return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const sessionToken = req.cookies.get("praxarch_session")?.value;

  const res = await fetch(`${apiBase}/marketing/publish-request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
