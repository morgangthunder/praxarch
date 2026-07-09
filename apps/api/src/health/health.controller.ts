import { Controller, Get } from "@nestjs/common";
import { API_VERSION } from "../version";

/**
 * Liveness probe. Intentionally has NO tenant/auth dependency (excluded from
 * TenantResolverMiddleware) so load balancers, Coolify, and Praxarch's own
 * deploy diagnostics can hit it regardless of AUTH_PROVIDER.
 */
@Controller("health")
export class HealthController {
  private readonly startedAt = Date.now();

  @Get()
  check(): { status: "ok"; version: string; uptimeSeconds: number } {
    return {
      status: "ok",
      version: API_VERSION,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }
}
