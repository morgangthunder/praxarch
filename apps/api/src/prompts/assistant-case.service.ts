import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LlmClient } from "../assistant/llm.client";
import { DatabaseService } from "../common/database/database.service";
import {
  AssistantCaseEntry,
  CONTEXT_FIELD_DEFS,
  ContextFieldKey,
  ContextFieldsConfig,
  DEFAULT_ASSISTANT_CASE_KEY,
  DEFAULT_CONTEXT_FIELDS,
  MODEL_PROVIDERS,
  ModelProviderId,
  ResolvedAssistantCase,
} from "./ai-case.types";

interface CaseRow {
  case_key: string;
  label: string;
  description: string | null;
  model_provider: string;
  model_id: string;
  api_base_url: string | null;
  guardrail_prompt_key: string;
  behavior_prompt_key: string;
  context_fields: ContextFieldsConfig;
  sort_order: number;
  updated_at: Date;
}

const DEFAULT_CASE: AssistantCaseEntry = {
  caseKey: DEFAULT_ASSISTANT_CASE_KEY,
  label: "Praxarch General AI Assistant",
  description: "In-app agentic assistant for deployments, operations, and marketing actions.",
  modelProvider: "xai",
  modelId: "grok-2-latest",
  apiBaseUrl: null,
  guardrailPromptKey: "assistant.guardrail",
  behaviorPromptKey: "assistant.chat.system",
  contextFields: { ...DEFAULT_CONTEXT_FIELDS },
  sortOrder: 0,
  updatedAt: null,
};

/**
 * Per-use-case AI configuration: model provider/version, associated guardrail +
 * behavior prompts, and which context fields to append each turn.
 */
@Injectable()
export class AssistantCaseService {
  private readonly logger = new Logger(AssistantCaseService.name);
  private readonly llm = new LlmClient(process.env);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService
  ) {}

  async listProviders() {
    return Promise.all(
      MODEL_PROVIDERS.map(async (p) => {
        const configured = this.providerConfigured(p.id);
        let models = [...p.catalog];
        let modelsSource: "live" | "catalog" = "catalog";

        if (configured) {
          const liveIds = await this.llm.listModels(p.id, p.defaultBaseUrl);
          if (liveIds.length) {
            models = await this.llm.resolveModelOptions(p.id, p.defaultBaseUrl, [...p.catalog]);
            modelsSource = "live";
          }
        }

        return {
          id: p.id,
          label: p.label,
          defaultBaseUrl: p.defaultBaseUrl,
          models,
          modelsSource,
          configured,
        };
      })
    );
  }

  listContextFields() {
    return CONTEXT_FIELD_DEFS;
  }

  async list(): Promise<AssistantCaseEntry[]> {
    if (!this.db.enabled) return [DEFAULT_CASE];
    try {
      const rows = await this.db.query<CaseRow>(
        `SELECT * FROM public.assistant_cases ORDER BY sort_order, label`
      );
      if (!rows.length) return [DEFAULT_CASE];
      return rows.map((r) => this.toEntry(r));
    } catch (err) {
      this.logger.warn(`assistant_cases unavailable: ${(err as Error).message}`);
      return [DEFAULT_CASE];
    }
  }

  async get(caseKey: string): Promise<AssistantCaseEntry> {
    if (!this.db.enabled && caseKey === DEFAULT_ASSISTANT_CASE_KEY) return DEFAULT_CASE;
    const rows = await this.db.query<CaseRow>(
      `SELECT * FROM public.assistant_cases WHERE case_key = $1`,
      [caseKey]
    );
    if (!rows[0]) throw new NotFoundException(`Unknown assistant case: ${caseKey}`);
    return this.toEntry(rows[0]);
  }

  /** Resolved config for runtime (base URL + key presence). */
  async resolve(caseKey: string): Promise<ResolvedAssistantCase> {
    const entry = caseKey === DEFAULT_ASSISTANT_CASE_KEY && !this.db.enabled
      ? DEFAULT_CASE
      : await this.get(caseKey).catch(() => DEFAULT_CASE);
    const provider = MODEL_PROVIDERS.find((p) => p.id === entry.modelProvider) ?? MODEL_PROVIDERS[0];
    return {
      ...entry,
      resolvedBaseUrl: entry.apiBaseUrl ?? provider.defaultBaseUrl,
      providerConfigured: this.providerConfigured(entry.modelProvider),
    };
  }

  async update(
    caseKey: string,
    patch: Partial<{
      label: string;
      description: string | null;
      modelProvider: ModelProviderId;
      modelId: string;
      apiBaseUrl: string | null;
      guardrailPromptKey: string;
      behaviorPromptKey: string;
      contextFields: ContextFieldsConfig;
    }>
  ): Promise<AssistantCaseEntry> {
    const current = await this.get(caseKey);
    if (!this.db.enabled) {
      this.logger.warn("DB disabled — case update not persisted.");
      return { ...current, ...patch, updatedAt: null };
    }

    const merged: AssistantCaseEntry = {
      ...current,
      ...patch,
      contextFields: patch.contextFields ?? current.contextFields,
    };

    const rows = await this.db.query<CaseRow>(
      `UPDATE public.assistant_cases SET
         label = $2,
         description = $3,
         model_provider = $4,
         model_id = $5,
         api_base_url = $6,
         guardrail_prompt_key = $7,
         behavior_prompt_key = $8,
         context_fields = $9::jsonb,
         updated_at = now()
       WHERE case_key = $1
       RETURNING *`,
      [
        caseKey,
        merged.label,
        merged.description,
        merged.modelProvider,
        merged.modelId,
        merged.apiBaseUrl,
        merged.guardrailPromptKey,
        merged.behaviorPromptKey,
        JSON.stringify(merged.contextFields),
      ]
    );
    this.logger.log(`Assistant case "${caseKey}" updated → ${merged.modelProvider}/${merged.modelId}`);
    return this.toEntry(rows[0]);
  }

  private providerConfigured(providerId: string): boolean {
    const provider = MODEL_PROVIDERS.find((p) => p.id === providerId);
    if (!provider) return false;
    const key =
      this.config.get<string>(provider.envKey) ??
      ("altEnvKey" in provider ? this.config.get<string>(provider.altEnvKey!) : undefined);
    return !!key?.length;
  }

  private toEntry(row: CaseRow): AssistantCaseEntry {
    const fields = { ...DEFAULT_CONTEXT_FIELDS, ...(row.context_fields ?? {}) };
    for (const def of CONTEXT_FIELD_DEFS) {
      if (typeof fields[def.key] !== "boolean") fields[def.key as ContextFieldKey] = DEFAULT_CONTEXT_FIELDS[def.key];
    }
    return {
      caseKey: row.case_key,
      label: row.label,
      description: row.description,
      modelProvider: row.model_provider as ModelProviderId,
      modelId: row.model_id,
      apiBaseUrl: row.api_base_url,
      guardrailPromptKey: row.guardrail_prompt_key,
      behaviorPromptKey: row.behavior_prompt_key,
      contextFields: fields,
      sortOrder: row.sort_order,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
  }
}
