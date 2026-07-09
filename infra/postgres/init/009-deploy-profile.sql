-- Per-environment deploy driver (Coolify API vs Praxarch SSH source-build overlays).
ALTER TABLE public.deploy_targets
    ADD COLUMN IF NOT EXISTS deploy_profile TEXT NOT NULL DEFAULT 'coolify',
    ADD COLUMN IF NOT EXISTS deploy_profile_options JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Bubblbook production: bridge Coolify deploy (aligned with staging architecture).
UPDATE public.deploy_targets
SET deploy_profile = 'coolify',
    deploy_profile_options = '{}'::jsonb
WHERE tenant_id = 'bubblbook'
  AND service_id = 'bubblbook'
  AND environment = 'production';
