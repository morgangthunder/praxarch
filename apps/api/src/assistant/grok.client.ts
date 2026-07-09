import { Logger } from "@nestjs/common";

/** OpenAI-compatible chat message (xAI Grok speaks the same dialect). */
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

/**
 * Thin xAI Grok client (Chat Completions w/ tool-calling). Returns `null` from
 * `isConfigured()` when no key is present so the assistant can fall back to a
 * deterministic placeholder router (per the unprovisioned-key convention).
 */
export class GrokClient {
  private readonly logger = new Logger(GrokClient.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(env: NodeJS.ProcessEnv) {
    this.apiKey = env.GROK_API_KEY ?? env.XAI_API_KEY ?? "";
    this.baseUrl = env.GROK_API_URL ?? "https://api.x.ai/v1";
    this.model = env.GROK_MODEL ?? "grok-2-latest";
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /** Model + endpoint in effect — surfaced on boot so the running config is visible. */
  describe(): { model: string; baseUrl: string; configured: boolean } {
    return { model: this.model, baseUrl: this.baseUrl, configured: this.isConfigured() };
  }

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatCompletion> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools: tools.length ? tools : undefined,
        tool_choice: tools.length ? "auto" : undefined,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      this.logger.error(`Grok chat failed (${res.status}): ${detail}`);
      throw new Error(`Grok upstream ${res.status}`);
    }

    const body = (await res.json()) as { choices: { message: ChatMessage }[] };
    return { message: body.choices[0].message };
  }
}
