import { NextRequest, NextResponse } from "next/server";
import { readJsonResponse } from "@/lib/safe-json";

const apiBase = () => process.env.API_BASE_URL;

function tenantHeader(req: NextRequest): Record<string, string> {
  const t = req.headers.get("x-praxarch-tenant");
  return t ? { "x-praxarch-tenant": t } : {};
}

/** GET → GitHub Actions ECR build readiness for an environment branch. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const base = apiBase();
  if (!base) return NextResponse.json({ error: "API_BASE_URL not configured" }, { status: 500 });

  const { id } = await params;
  const environment = req.nextUrl.searchParams.get("environment");
  const ref = req.nextUrl.searchParams.get("ref");
  if (!environment) {
    return NextResponse.json({ error: "environment query param required" }, { status: 400 });
  }

  const qs = new URLSearchParams({ environment });
  if (ref) qs.set("ref", ref);

  try {
    const res = await fetch(`${base}/cicd/services/${encodeURIComponent(id)}/ci-readiness?${qs}`, {
      headers: { ...tenantHeader(req) },
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    const data = (await readJsonResponse(res)) ?? {
      state: "blocked",
      reason: "check_failed",
      message: "CI readiness check returned an empty response. Try again in a moment.",
    };
    return NextResponse.json(data, { status: res.ok ? res.status : res.status || 502 });
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "CI readiness check timed out. GitHub may be slow — try again in a moment."
        : "Could not reach the deploy API for CI status. Try refreshing.";
    return NextResponse.json(
      { state: "blocked", reason: "check_failed", message },
      { status: 503 }
    );
  }
}
