import { NextRequest, NextResponse } from "next/server";



const apiBase = () => process.env.API_BASE_URL;



function tenantHeader(req: NextRequest): Record<string, string> {

  const t = req.headers.get("x-praxarch-tenant");

  return t ? { "x-praxarch-tenant": t } : {};

}



/** GET → load wizard config for an existing deployment. */

export async function GET(

  req: NextRequest,

  { params }: { params: Promise<{ id: string }> }

) {

  const base = apiBase();

  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });



  const { id } = await params;

  const res = await fetch(`${base}/cicd/services/${encodeURIComponent(id)}/wizard`, {

    headers: { ...tenantHeader(req) },

    cache: "no-store",

  });

  const data = await res.json().catch(() => ({}));

  return NextResponse.json(data, { status: res.status });

}


