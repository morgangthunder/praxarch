import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/**
 * Resolved tenant context for the current request.
 * Populated by TenantResolverMiddleware after JWT + subdomain validation.
 */
export interface TenantContext {
  tenantId: string;
  /** Postgres schema for this tenant (schema-per-tenant isolation). */
  schema: string;
  /** Authenticated principal id. */
  accountId: string;
  roles: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

/** Inject the resolved tenant context into a controller handler. */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest();
    if (!req.tenant) {
      // Fail-safe: a handler should never run without a resolved tenant.
      throw new Error("Tenant context missing — TenantResolverMiddleware did not run.");
    }
    return req.tenant;
  }
);
