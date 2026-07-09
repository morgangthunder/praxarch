-- Encrypted tenant secrets for provisioning (Gate 1.5c/1.5e).
CREATE TABLE IF NOT EXISTS public.tenant_secrets (
    tenant_id   TEXT NOT NULL,
    secret_key  TEXT NOT NULL,
    ciphertext  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, secret_key)
);
