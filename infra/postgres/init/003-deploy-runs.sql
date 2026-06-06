-- Deploy run tracking (Gate 1.1 — live status in UI).
CREATE TABLE IF NOT EXISTS public.deploy_runs (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT NOT NULL,
    project       TEXT NOT NULL,
    service_id    TEXT,
    environment   TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'queued',
    tag           TEXT,
    actor         TEXT,
    driver        TEXT NOT NULL DEFAULT 'simulate',
    commit_sha    TEXT,
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deploy_runs_tenant
    ON public.deploy_runs (tenant_id, created_at DESC);
