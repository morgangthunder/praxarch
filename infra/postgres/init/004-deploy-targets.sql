-- Per-tenant Coolify app mapping (Gate 1.5b — replaces COOLIFY_APP_* env vars).
CREATE TABLE IF NOT EXISTS public.deploy_targets (
    id                   TEXT PRIMARY KEY,
    tenant_id            TEXT NOT NULL,
    service_id           TEXT NOT NULL,
    environment          TEXT NOT NULL,
    coolify_project_uuid TEXT,
    coolify_app_uuid     TEXT,
    coolify_env_uuid     TEXT,
    repo                 TEXT NOT NULL,
    branch               TEXT NOT NULL DEFAULT 'main',
    git_provider         TEXT NOT NULL DEFAULT 'github',
    auth_method          TEXT NOT NULL DEFAULT 'deploy_key',
    private_key_uuid     TEXT,
    build_pack           TEXT NOT NULL DEFAULT 'nixpacks',
    ports_exposes        TEXT NOT NULL DEFAULT '3000',
    status               TEXT NOT NULL DEFAULT 'pending',
    error_message        TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, service_id, environment)
);
CREATE INDEX IF NOT EXISTS idx_deploy_targets_tenant
    ON public.deploy_targets (tenant_id);
