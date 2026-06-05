# ADR-0001: Multi-Tenancy Isolation Strategy

- **Status:** Accepted
- **Date:** 2026-06-05
- **Deciders:** Platform Architecture

## Context

Praxarch is a B2B SaaS managing autonomous business operations (and PII/financial data) for many tenants. We need strong data isolation, predictable performance, and per-tenant operability (backup, restore, export, delete-on-churn) without unsustainable operational overhead.

Three common strategies were considered:

1. **Shared schema + Row-Level Security (RLS).** One set of tables; every row carries `tenant_id`; Postgres RLS policies enforce access.
2. **Schema-per-tenant.** Shared database; each tenant gets its own schema (`tenant_<id>`); the app sets `search_path` per request.
3. **Database-per-tenant.** Fully separate databases (or instances).

## Decision

**Adopt Schema-per-tenant** as the primary isolation strategy, with a shared `public` schema for the platform catalog.

## Rationale

| Criterion | Shared + RLS | **Schema-per-tenant** | DB-per-tenant |
|---|---|---|---|
| Isolation strength | Medium (1 bad policy = leak) | **Strong** | Strongest |
| Blast radius of bug | High (all tenants) | **Low (one tenant)** | Lowest |
| Per-tenant backup/restore/export | Hard | **Easy** | Easy |
| Connection pooling cost | Low | **Low** | High (pool per DB) |
| Migration complexity | Low | Medium (fan-out) | High |
| Noisy-neighbor control | Weak | Medium | **Strong** |
| Ops overhead at 1k tenants | Low | **Manageable** | High |

Schema-per-tenant is the best balance for our scale and isolation requirements. RLS-only concentrates risk in policy correctness; DB-per-tenant explodes connection/ops cost early.

## Consequences

**Positive**
- A query without a resolved `search_path` simply finds no tenant tables — fail-safe.
- Clean per-tenant lifecycle: `CREATE SCHEMA` on onboard, `pg_dump -n` for export, `DROP SCHEMA` on churn.

**Negative / Mitigations**
- **Migrations must fan out across schemas.** → Maintain a migration runner that iterates the tenant registry; track `schema_version` per tenant.
- **Connection `search_path` leakage in pools.** → Reset `search_path` on connection release; set it explicitly at the start of each request lifecycle.
- **Cross-tenant analytics** need rollups. → Aggregate into `public` rollup tables via scheduled jobs rather than cross-schema scans.

## Implementation Notes

- Tenant Resolver middleware (NestJS) verifies `tenant_id` from the JWT, validates against subdomain, then issues `SET search_path TO "tenant_<id>", public`.
- Supabase Vault holds per-tenant secrets, keyed by `tenant_id`.
- Super-Admin observability uses an elevated, **audited** role permitted to switch schemas.
