-- AI assistant cases: per-use-case model + prompt + context configuration (Gate 1.6b).
ALTER TABLE public.assistant_prompts
    ADD COLUMN IF NOT EXISTS label TEXT,
    ADD COLUMN IF NOT EXISTS scope TEXT,
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'override';

CREATE TABLE IF NOT EXISTS public.assistant_cases (
    case_key              TEXT PRIMARY KEY,
    label                 TEXT NOT NULL,
    description           TEXT,
    model_provider        TEXT NOT NULL DEFAULT 'xai',
    model_id              TEXT NOT NULL DEFAULT 'grok-2-latest',
    api_base_url          TEXT,
    guardrail_prompt_key  TEXT NOT NULL DEFAULT 'assistant.guardrail',
    behavior_prompt_key   TEXT NOT NULL DEFAULT 'assistant.chat.system',
    context_fields        JSONB NOT NULL DEFAULT '{
        "tenant": true,
        "userRole": true,
        "tenantRoles": true,
        "currentTime": true,
        "route": true,
        "module": true,
        "wizardStep": true,
        "wizardHosting": true,
        "tools": true
    }'::jsonb,
    sort_order            INT NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.assistant_cases (case_key, label, description, model_provider, model_id, sort_order)
VALUES (
    'praxarch.general',
    'Praxarch General AI Assistant',
    'In-app agentic assistant for deployments, operations, and marketing actions.',
    'xai',
    'grok-2-latest',
    0
)
ON CONFLICT (case_key) DO NOTHING;
