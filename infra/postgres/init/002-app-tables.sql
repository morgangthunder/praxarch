-- Praxarch application tables (prototype persistence).
--
-- Prototype note: rows are keyed by a TEXT `tenant_id` (the tenant slug) in the
-- `public` schema for simplicity. The documented target is schema-per-tenant
-- (`tenant_<id>`) with RLS — these tables move into the per-tenant schema then.

-- ── HITL checkpoints (the approval rail: n8n / deploy / publish) ───────
CREATE TABLE IF NOT EXISTS public.hitl_checkpoints (
    id             UUID PRIMARY KEY,
    tenant_id      TEXT NOT NULL,
    execution_id   TEXT,
    resume_token   TEXT,
    kind           TEXT NOT NULL,
    action         JSONB NOT NULL DEFAULT '{"type":"n8n"}',
    summary        TEXT NOT NULL,
    approver_wa_id TEXT NOT NULL,
    status         TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL,
    expires_at     TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checkpoints_approver_awaiting
    ON public.hitl_checkpoints (approver_wa_id, status, created_at DESC);

-- ── Deployable services (per tenant) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deploy_services (
    id           TEXT NOT NULL,
    tenant_id    TEXT NOT NULL,
    name         TEXT NOT NULL,
    repo         TEXT NOT NULL,
    kind         TEXT NOT NULL DEFAULT 'app',
    environments JSONB NOT NULL DEFAULT '[]',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id)
);

-- ── AI content drafts (per tenant) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_drafts (
    id         TEXT NOT NULL,
    tenant_id  TEXT NOT NULL,
    channel    TEXT NOT NULL,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id)
);

-- ── Per-tenant workspace settings (HITL approver, autonomy) ────────────
CREATE TABLE IF NOT EXISTS public.workspace_settings (
    tenant_id        TEXT PRIMARY KEY,
    approver_wa_id   TEXT,
    default_autonomy TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Capability dispatch audit + credit ledger ─────────────────────────
CREATE TABLE IF NOT EXISTS public.capability_audit (
    id            UUID PRIMARY KEY,
    tenant_id     TEXT NOT NULL,
    capability_id TEXT NOT NULL,
    source        TEXT NOT NULL,
    actor         TEXT NOT NULL,
    status        TEXT NOT NULL,
    credits       INTEGER NOT NULL DEFAULT 0,
    input         JSONB,
    result        JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_capability_audit_tenant
    ON public.capability_audit (tenant_id, created_at DESC);
