import { NextRequest, NextResponse } from "next/server";

/** PATCH → update a content draft's status (approve/publish/reject). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const base = process.env.API_BASE_URL;
  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const tenant = req.headers.get("x-praxarch-tenant");

  const res = await fetch(`${base}/marketing/content/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(tenant ? { "x-praxarch-tenant": tenant } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
