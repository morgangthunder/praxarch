/** Default assistant case — in-app panel + wizard "Ask assistant". */
export const DEFAULT_ASSISTANT_CASE_KEY = "praxarch.general";

/** Context fields the assistant can append per turn (toggleable per case). */
export const CONTEXT_FIELD_DEFS = [
  { key: "tenant", label: "Active tenant", description: "The resolved tenant slug for this session." },
  { key: "userRole", label: "User role", description: "The View-as identity (owner, member, super_admin, etc.)." },
  { key: "tenantRoles", label: "Server-verified roles", description: "RBAC roles from the authenticated session." },
  { key: "currentTime", label: "Current timestamp", description: "ISO timestamp at request time." },
  { key: "route", label: "Current route", description: "Full pathname the user is on." },
  { key: "module", label: "Current module", description: "Workspace module segment (deployments, crm, etc.)." },
  { key: "wizardStep", label: "Wizard step", description: "Add-deployment wizard step when open." },
  { key: "wizardHosting", label: "Wizard hosting topology", description: "local / cloud-split / cloud-single when in wizard." },
  { key: "tools", label: "Tool catalogue", description: "Summary of deployment tools available to the model." },
] as const;

export type ContextFieldKey = (typeof CONTEXT_FIELD_DEFS)[number]["key"];

export type ContextFieldsConfig = Record<ContextFieldKey, boolean>;

export const DEFAULT_CONTEXT_FIELDS: ContextFieldsConfig = {
  tenant: true,
  userRole: true,
  tenantRoles: true,
  currentTime: true,
  route: true,
  module: true,
  wizardStep: true,
  wizardHosting: true,
  tools: true,
};

/** Tier helps the admin UI group and recommend models. */
export type ModelTier = "recommended" | "fast" | "reasoning" | "specialist" | "legacy";

export interface ModelOption {
  id: string;
  label: string;
  hint?: string;
  tier: ModelTier;
}

/** Static catalogue — merged with live /v1/models when an API key is configured. */
export const XAI_MODEL_CATALOG: ModelOption[] = [
  {
    id: "grok-4.3",
    label: "Grok 4.3",
    hint: "Flagship — best agentic tool-calling; $1.25 / $2.50 per M tokens",
    tier: "recommended",
  },
  {
    id: "grok-4.20-0309-non-reasoning",
    label: "Grok 4.20 Non-reasoning",
    hint: "Fast responses, same price as 4.3 — good default for deployment ops",
    tier: "fast",
  },
  {
    id: "grok-4.20-0309-reasoning",
    label: "Grok 4.20 Reasoning",
    hint: "Deeper multi-step reasoning — slower, same token price",
    tier: "reasoning",
  },
  {
    id: "grok-4.20-multi-agent-0309",
    label: "Grok 4.20 Multi-agent",
    hint: "2M context — long docs / orchestration workloads",
    tier: "specialist",
  },
  {
    id: "grok-build-0.1",
    label: "Grok Build 0.1",
    hint: "Coding specialist — $1.00 / $2.00 per M tokens",
    tier: "specialist",
  },
  {
    id: "grok-3-mini",
    label: "Grok 3 Mini",
    hint: "Legacy budget — $0.30 / $0.50; weaker tool-calling",
    tier: "legacy",
  },
  {
    id: "grok-2-latest",
    label: "Grok 2 (legacy)",
    hint: "Superseded — use 4.3 or 4.20 non-reasoning instead",
    tier: "legacy",
  },
];

export const OPENAI_MODEL_CATALOG: ModelOption[] = [
  { id: "gpt-4o", label: "GPT-4o", hint: "Frontier multimodal", tier: "recommended" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", hint: "Fast + cheap", tier: "fast" },
  { id: "gpt-4-turbo", label: "GPT-4 Turbo", hint: "Legacy", tier: "legacy" },
];

/** Supported LLM providers (extensible — add env keys as new providers ship). */
export const MODEL_PROVIDERS = [
  {
    id: "xai",
    label: "xAI (Grok)",
    defaultBaseUrl: "https://api.x.ai/v1",
    envKey: "GROK_API_KEY",
    altEnvKey: "XAI_API_KEY",
    catalog: XAI_MODEL_CATALOG,
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    catalog: OPENAI_MODEL_CATALOG,
  },
] as const;

export type ModelProviderId = (typeof MODEL_PROVIDERS)[number]["id"];

export interface AssistantCaseEntry {
  caseKey: string;
  label: string;
  description: string | null;
  modelProvider: ModelProviderId;
  modelId: string;
  apiBaseUrl: string | null;
  guardrailPromptKey: string;
  behaviorPromptKey: string;
  contextFields: ContextFieldsConfig;
  sortOrder: number;
  updatedAt: string | null;
}

export interface ResolvedAssistantCase extends AssistantCaseEntry {
  /** Effective API base URL (case override or provider default). */
  resolvedBaseUrl: string;
  /** Whether the provider's API key is present in env. */
  providerConfigured: boolean;
}
