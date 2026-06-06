import { NextRequest, NextResponse } from "next/server";

/**
 * BFF proxy → NestJS promote-request (the Member path).
 *
 * Forwards a production-promote *request* to the gateway, which opens a WhatsApp
 * HITL checkpoint for an Owner to approve. No deploy secrets ever touch the client.
 */
export async function POST(req: NextRequest) {
  const apiBase = process.env.API_BASE_URL;
  if (!apiBase) {
    return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const sessionToken = req.cookies.get("praxarch_session")?.value;
  const tenant = req.headers.get("x-praxarch-tenant");

  const res = await fetch(`${apiBase}/cicd/promote-request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...(tenant ? { "x-praxarch-tenant": tenant } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
