import { NextRequest, NextResponse } from "next/server";



const apiBase = () => process.env.API_BASE_URL;



function tenantHeader(req: NextRequest): Record<string, string> {

  const t = req.headers.get("x-praxarch-tenant");

  return t ? { "x-praxarch-tenant": t } : {};

}



/** PATCH → save wizard changes for an existing deployment. */

export async function PATCH(

  req: NextRequest,

  { params }: { params: Promise<{ id: string }> }

) {

  const base = apiBase();

  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });



  const { id } = await params;

  const body = await req.json().catch(() => ({}));

  const res = await fetch(`${base}/cicd/services/${encodeURIComponent(id)}/deployment`, {

    method: "PATCH",

    headers: { "Content-Type": "application/json", ...tenantHeader(req) },

    body: JSON.stringify(body),

    cache: "no-store",

  });

  const data = await res.json().catch(() => ({}));

  return NextResponse.json(data, { status: res.status });

}


