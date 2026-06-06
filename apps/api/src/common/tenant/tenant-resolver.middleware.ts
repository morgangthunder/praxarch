import { Injectable, NestMiddleware, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NextFunction, Request, Response } from "express";
import type { TenantContext } from "./tenant-context";

/**
 * Resolves and validates the tenant for every request, then exposes it on `req.tenant`.
 *
 * Resolution order (fail-safe):
 *   1. verified JWT claim `tenant_id`
 *   2. cross-check against host subdomain
 *   3. reject on mismatch / absence
 *
 * Downstream DB access uses `schema` to `SET search_path` (schema-per-tenant).
 * Webhook routes are excluded — they carry no user session and resolve tenant
 * from the verified payload instead.
 */
@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    // Local/guest mode: no real IdP. Resolve a demo tenant from a header so the
    // app is fully exercisable without a JWT. NEVER enabled in production.
    if (this.config.get<string>("AUTH_PROVIDER") === "none") {
      const slug = (req.headers["x-praxarch-tenant"] as string) || "acme";
      req.tenant = {
        tenantId: slug,
        schema: `tenant_${slug}`,
        accountId: "dev-user",
        // Full capabilities so deploy + promote + publish are demoable locally.
        roles: ["platform:operator", "platform:release", "owner"],
      };
      return next();
    }

    const claims = this.verifyAndDecode(req.headers.authorization);
    const tenantId = claims.tenantId;

    const subdomain = this.extractSubdomain(req.headers.host);
    if (subdomain && claims.tenantSlug && subdomain !== claims.tenantSlug) {
      throw new UnauthorizedException("Tenant/host mismatch");
    }

    const tenant: TenantContext = {
      tenantId,
      schema: `tenant_${tenantId.replace(/-/g, "")}`,
      accountId: claims.accountId,
      roles: claims.roles,
    };
    req.tenant = tenant;
    next();
  }

  /**
   * Placeholder for real JWT verification (e.g. jose + JWKS from the auth provider).
   * Throws if the token is missing/invalid. Replace with provider integration.
   */
  private verifyAndDecode(authHeader?: string): {
    tenantId: string;
    tenantSlug?: string;
    accountId: string;
    roles: string[];
  } {
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }
    // TODO: verify signature against JWKS; below is the post-verification shape.
    throw new UnauthorizedException("JWT verification not configured");
  }

  private extractSubdomain(host?: string): string | null {
    if (!host) return null;
    const parts = host.split(".");
    return parts.length > 2 ? parts[0] : null;
  }
}
