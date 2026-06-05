import { NextRequest, NextResponse } from "next/server";

/**
 * BFF proxy → NestJS CI/CD module.
 *
 * The frontend never holds deploy secrets. This route forwards the request to
 * the trusted NestJS gateway, attaching the user's session token (httpOnly cookie)
 * for tenant + RBAC resolution on the backend.
 */
export async function POST(req: NextRequest) {
  const apiBase = process.env.API_BASE_URL;
  if (!apiBase) {
    return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const sessionToken = req.cookies.get("praxarch_session")?.value;

  const res = await fetch(`${apiBase}/cicd/deploy`, {
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
