-- Gate 1.5c: map each environment to a specific Coolify server (localhost, EC2, etc.).
ALTER TABLE public.deploy_targets
    ADD COLUMN IF NOT EXISTS coolify_server_uuid TEXT;

CREATE INDEX IF NOT EXISTS idx_deploy_targets_server
    ON public.deploy_targets (coolify_server_uuid)
    WHERE coolify_server_uuid IS NOT NULL;
