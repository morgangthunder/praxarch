-- ── Praxarch self-deploy target (TEMPLATE) ──────────────────────────
-- Registers Praxarch itself as a deployment target so a Praxarch instance
-- (local or hosted) can deploy the hosted Praxarch stack via Coolify.
--
-- NOT auto-run: this file lives in scripts/ (not infra/postgres/init/) because
-- the coolify_*_uuid values only exist AFTER you provision the operator Coolify
-- app. Two ways to populate this row:
--
--   A. Preferred — use the Praxarch Add Deployment wizard (fills UUIDs for you).
--   B. Manual — provision the Coolify app, then replace the <PLACEHOLDER> values
--      below and run:  psql "$DATABASE_URL" -f scripts/seed-praxarch-self-deploy.sql
--
-- Assumes tenant 'praxarch' (the operator's own tenant). Adjust as needed.

INSERT INTO public.deploy_targets (
    id, tenant_id, service_id, environment,
    coolify_server_uuid, coolify_project_uuid, coolify_app_uuid, coolify_env_uuid,
    repo, branch, git_provider, auth_method, build_pack, ports_exposes, status
) VALUES (
    'praxarch-praxarch-production',
    'praxarch',
    'praxarch',
    'production',
    '<COOLIFY_SERVER_UUID>',      -- server hosting Praxarch (EC2 registered in Coolify)
    '<COOLIFY_PROJECT_UUID>',
    '<COOLIFY_APP_UUID>',
    '<COOLIFY_ENV_UUID>',
    'git@github.com:<owner>/Praxarch.git',
    'main',
    'github',
    'deploy_key',
    'dockercompose',             -- deploys docker-compose.prod.yml
    '80,443',
    'ready'
)
ON CONFLICT (tenant_id, service_id, environment) DO UPDATE SET
    coolify_server_uuid  = EXCLUDED.coolify_server_uuid,
    coolify_project_uuid = EXCLUDED.coolify_project_uuid,
    coolify_app_uuid     = EXCLUDED.coolify_app_uuid,
    coolify_env_uuid     = EXCLUDED.coolify_env_uuid,
    repo                 = EXCLUDED.repo,
    branch               = EXCLUDED.branch,
    build_pack           = EXCLUDED.build_pack,
    ports_exposes        = EXCLUDED.ports_exposes,
    status               = EXCLUDED.status,
    updated_at           = now();
