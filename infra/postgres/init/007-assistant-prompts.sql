-- Platform-wide, versioned prompts driving the in-app assistant (Gate 1.6).
-- These are super-admin / operator config (NOT tenant-scoped): the guardrail
-- prompt and assistant persona are applied on every assistant turn for every
-- tenant. Built-in defaults live in code; rows here override per key and bump
-- the version on each save so changes are auditable.
CREATE TABLE IF NOT EXISTS public.assistant_prompts (
    prompt_key  TEXT PRIMARY KEY,
    body        TEXT NOT NULL,
    version     INT NOT NULL DEFAULT 1,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
