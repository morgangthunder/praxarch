import { NextRequest, NextResponse } from "next/server";

/** BFF proxy -> NestJS capability catalogue (for the command bar + assistant). */
export async function GET(req: NextRequest) {
  const apiBase = process.env.API_BASE_URL;
  if (!apiBase) {
    return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });
  }

  const tenant = req.headers.get("x-praxarch-tenant") ?? "acme";
  const res = await fetch(`${apiBase}/capabilities`, {
    headers: { "x-praxarch-tenant": tenant },
    cache: "no-store",
  });
  const data = await res.json().catch(() => []);
  return NextResponse.json(data, { status: res.status });
}
