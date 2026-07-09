import { Logger } from "@nestjs/common";
import { MODEL_PROVIDERS, type ModelOption } from "../prompts/ai-case.types";

/** OpenAI-compatible chat message (xAI Grok + OpenAI share this dialect). */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  };
}

export interface ChatCompletion {
  message: ChatMessage;
}

export interface LlmCallConfig {
  provider: string;
  model: string;
  baseUrl: string;
}

/**
 * Provider-routed LLM client. Model + endpoint come from the assistant case
 * config (super-admin UI); API keys stay in env per provider.
 */
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name);
  private readonly env: NodeJS.ProcessEnv;
  private readonly envFallbackModel: string;

  constructor(env: NodeJS.ProcessEnv) {
    this.env = env;
    this.envFallbackModel = env.GROK_MODEL ?? "grok-2-latest";
  }

  /** True when any provider key is set (used for placeholder vs Grok mode). */
  isAnyConfigured(): boolean {
    return MODEL_PROVIDERS.some((p) => this.apiKey(p.id).length > 0);
  }

  isConfigured(config: LlmCallConfig): boolean {
    return this.apiKey(config.provider).length > 0;
  }

  describeFallback(): { model: string; configured: boolean } {
    return { model: this.envFallbackModel, configured: this.isAnyConfigured() };
  }

  async chat(
    config: LlmCallConfig,
    messages: ChatMessage[],
    tools: ToolDefinition[]
  ): Promise<ChatCompletion> {
    const apiKey = this.apiKey(config.provider);
    if (!apiKey) {
      throw new Error(`No API key configured for provider "${config.provider}"`);
    }

    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        tools: tools.length ? tools : undefined,
        tool_choice: tools.length ? "auto" : undefined,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      this.logger.error(`${config.provider} chat failed (${res.status}): ${detail}`);
      throw new Error(`LLM upstream ${config.provider} ${res.status}`);
    }

    const body = (await res.json()) as { choices: { message: ChatMessage }[] };
    return { message: body.choices[0].message };
  }

  /**
   * Fetch models exposed to this API key (OpenAI-compatible /v1/models).
   * Non-chat models (image/video/voice) are filtered out.
   */
  async listModels(providerId: string, baseUrl: string): Promise<string[]> {
    const apiKey = this.apiKey(providerId);
    if (!apiKey) return [];

    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      this.logger.warn(`${providerId} /models failed (${res.status}): ${detail.slice(0, 200)}`);
      return [];
    }

    const body = (await res.json()) as { data?: { id: string }[] };
    return (body.data ?? [])
      .map((m) => m.id)
      .filter((id) => this.isChatModel(id))
      .sort();
  }

  /** Merge live API model IDs with the static catalogue (catalogue enriches labels). */
  async resolveModelOptions(providerId: string, baseUrl: string, catalog: ModelOption[]): Promise<ModelOption[]> {
    const byId = new Map(catalog.map((m) => [m.id, m]));
    const live = await this.listModels(providerId, baseUrl);

    for (const id of live) {
      if (!byId.has(id)) {
        byId.set(id, { id, label: id, tier: "legacy" });
      }
    }

    const tierOrder = { recommended: 0, fast: 1, reasoning: 2, specialist: 3, legacy: 4 };
    return [...byId.values()].sort((a, b) => {
      const td = tierOrder[a.tier] - tierOrder[b.tier];
      return td !== 0 ? td : a.label.localeCompare(b.label);
    });
  }

  private isChatModel(id: string): boolean {
    const lower = id.toLowerCase();
    if (lower.includes("imagine") || lower.includes("image") || lower.includes("video")) return false;
    if (lower.includes("voice") || lower.includes("tts") || lower.includes("whisper")) return false;
    if (lower.includes("embedding") || lower.startsWith("text-embedding")) return false;
    return true;
  }

  private apiKey(providerId: string): string {
    const provider = MODEL_PROVIDERS.find((p) => p.id === providerId);
    if (!provider) return "";
    const primary = this.env[provider.envKey] ?? "";
    if (primary) return primary;
    if ("altEnvKey" in provider && provider.altEnvKey) {
      return this.env[provider.altEnvKey] ?? "";
    }
    return "";
  }
}
