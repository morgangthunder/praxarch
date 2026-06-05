-- Praxarch initial database bootstrap.
-- Runs once on first container start (empty data volume).
--
-- Multi-tenancy = "schema-per-tenant" (see docs/adr/0001). The `public` schema
-- holds the platform catalog; each tenant gets its own `tenant_<id>` schema,
-- created at onboarding time by the API (not here).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Platform catalog (public schema) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenants (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    schema_name TEXT NOT NULL UNIQUE,
    autonomy    TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED'
                  CHECK (autonomy IN ('FULLY_AUTONOMOUS', 'APPROVAL_REQUIRED', 'PAUSED')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Versioned system prompts (the Prompt Registry meta-agent reads/writes here).
CREATE TABLE IF NOT EXISTS public.prompt_registry (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prompt_key  TEXT NOT NULL,
    version     INT  NOT NULL,
    body        TEXT NOT NULL,
    success_metrics JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (prompt_key, version)
);

-- Cross-tenant usage rollups (populated by scheduled jobs; avoids cross-schema scans).
CREATE TABLE IF NOT EXISTS public.usage_rollups (
    tenant_id   UUID NOT NULL,
    period      TEXT NOT NULL,
    credits_charged BIGINT NOT NULL DEFAULT 0,
    cost_eur_cents  BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, period)
);

-- A least-privilege application role would be created here in production.
