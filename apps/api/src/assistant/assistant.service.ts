import { Injectable, Logger } from "@nestjs/common";
import { CapabilityService } from "../capabilities/capability.service";
import type { CapabilitySummary } from "../capabilities/capability.types";
import type { TenantContext } from "../common/tenant/tenant-context";
import { ChatMessage, GrokClient, ToolDefinition } from "./grok.client";

/** Streamed events the controller turns into SSE frames. */
export type AssistantEvent =
  | { type: "tool_start"; capabilityId: string; input: Record<string, unknown> }
  | { type: "tool_result"; capabilityId: string; status: string; message?: string }
  | { type: "text"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantContext {
  tenant: TenantContext;
  module?: string;
  route?: string;
}

const MAX_TOOL_ROUNDS = 5;

/**
 * In-app agentic assistant. Exposes the Capability registry to Grok as tools and
 * dispatches tool calls through the same guarded path the UI uses (so RBAC,
 * autonomy/HITL, audit, and credit metering all apply). When no Grok key is set,
 * a deterministic placeholder still routes a few common deployment commands.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly grok = new GrokClient(process.env);

  constructor(private readonly capabilities: CapabilityService) {}

  async *stream(history: ChatTurn[], ctx: AssistantContext): AsyncGenerator<AssistantEvent> {
    try {
      if (this.grok.isConfigured()) {
        yield* this.streamWithGrok(history, ctx);
      } else {
        yield* this.streamPlaceholder(history, ctx);
      }
      yield { type: "done" };
    } catch (err) {
      this.logger.error(`Assistant error: ${(err as Error).message}`);
      yield { type: "error", message: (err as Error).message };
      yield { type: "done" };
    }
  }

  // ── Grok tool-calling loop ──────────────────────────────────────────────
  private async *streamWithGrok(
    history: ChatTurn[],
    ctx: AssistantContext
  ): AsyncGenerator<AssistantEvent> {
    const caps = this.capabilities.list();
    const tools = caps.map((c) => this.toToolDefinition(c));
    const messages: ChatMessage[] = [
      { role: "system", content: this.systemPrompt(ctx) },
      ...history.map((t) => ({ role: t.role, content: t.content } as ChatMessage)),
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const { message } = await this.grok.chat(messages, tools);
      messages.push(message);

      if (message.tool_calls?.length) {
        for (const call of message.tool_calls) {
          const capabilityId = this.fromToolName(call.function.name);
          const input = this.safeParse(call.function.arguments);
          yield { type: "tool_start", capabilityId, input };
          const result = await this.dispatch(capabilityId, input, ctx);
          yield {
            type: "tool_result",
            capabilityId,
            status: result.status,
            message: result.message,
          };
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify(result).slice(0, 4000),
          });
        }
        continue; // let the model read tool results and respond
      }

      yield* this.emitText(message.content ?? "");
      return;
    }
    yield* this.emitText("I've reached the maximum number of tool steps for this turn.");
  }

  // ── Deterministic placeholder (no Grok key) ─────────────────────────────
  private async *streamPlaceholder(
    history: ChatTurn[],
    ctx: AssistantContext
  ): AsyncGenerator<AssistantEvent> {
    const last = [...history].reverse().find((t) => t.role === "user")?.content ?? "";
    const text = last.toLowerCase();
    const wantsApproval = /(approv|ask|request|sign-?off)/.test(text);

    const listMatch = /\b(list|show|what).*(deployment|service)/.test(text);
    const stagingMatch = text.match(/deploy\s+([a-z0-9-]+)\s+to\s+staging/);
    const promoteMatch = text.match(/(promote|ship|release)\s+([a-z0-9-]+)\s+to\s+prod/);

    if (listMatch) {
      const result = await this.dispatch("deployments.listServices", {}, ctx, true);
      const names = Array.isArray(result.data)
        ? (result.data as { name: string }[]).map((s) => s.name).join(", ")
        : "(none)";
      yield* this.emitText(`Your deployable services: ${names}.`);
      return;
    }
    if (stagingMatch) {
      yield { type: "tool_start", capabilityId: "deployments.deployStaging", input: { project: stagingMatch[1] } };
      const result = await this.dispatch("deployments.deployStaging", { project: stagingMatch[1] }, ctx);
      yield { type: "tool_result", capabilityId: "deployments.deployStaging", status: result.status, message: result.message };
      yield* this.emitText(`Staging deploy for "${stagingMatch[1]}" is ${result.status}.`);
      return;
    }
    if (promoteMatch) {
      const input = { project: promoteMatch[2] };
      yield { type: "tool_start", capabilityId: "deployments.promoteProduction", input };
      const result = await this.dispatch("deployments.promoteProduction", input, ctx, false, wantsApproval);
      yield { type: "tool_result", capabilityId: "deployments.promoteProduction", status: result.status, message: result.message };
      yield* this.emitText(
        result.status === "awaiting_approval"
          ? `I've sent the production promote for "${promoteMatch[2]}" to WhatsApp for approval.`
          : `Production promote for "${promoteMatch[2]}" is ${result.status}.`
      );
      return;
    }

    yield* this.emitText(
      "Assistant is running without a Grok API key (placeholder mode). I can still: " +
        "list your services, deploy <service> to staging, or promote <service> to prod. " +
        "Set GROK_API_KEY to enable full natural-language tool use."
    );
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  private async dispatch(
    capabilityId: string,
    input: Record<string, unknown>,
    ctx: AssistantContext,
    silent = false,
    requestApproval = false
  ) {
    try {
      return await this.capabilities.dispatch(capabilityId, input, {
        tenant: ctx.tenant,
        source: "assistant",
        actor: `assistant:${ctx.tenant.accountId}`,
        requestApproval,
      });
    } catch (err) {
      if (!silent) this.logger.warn(`Tool ${capabilityId} failed: ${(err as Error).message}`);
      return { status: "error" as const, message: (err as Error).message };
    }
  }

  private async *emitText(text: string): AsyncGenerator<AssistantEvent> {
    for (let i = 0; i < text.length; i += 24) {
      yield { type: "text", delta: text.slice(i, i + 24) };
    }
  }

  private systemPrompt(ctx: AssistantContext): string {
    // In production this is composed from the Dynamic Prompt Registry.
    return [
      "You are the Praxarch operations assistant for a multi-tenant business platform.",
      "You can configure and run deployments and publish marketing content by calling the provided tools.",
      "Prefer a tool call over guessing. High-risk actions (production promotes, publishing) may require",
      "human approval over WhatsApp; if a tool returns status 'awaiting_approval', tell the user it was sent for approval.",
      ctx.module ? `The user is currently viewing the "${ctx.module}" module.` : "",
      `Active tenant: ${ctx.tenant.tenantId}.`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  private toToolDefinition(cap: CapabilitySummary): ToolDefinition {
    const properties: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(cap.inputSchema.properties)) {
      properties[key] =
        field.type === "array"
          ? { type: "array", items: { type: field.items ?? "string" }, description: field.description }
          : { type: field.type, description: field.description, ...(field.enum ? { enum: field.enum } : {}) };
    }
    return {
      type: "function",
      function: {
        name: this.toToolName(cap.id),
        description: cap.description,
        parameters: { type: "object", properties, required: cap.inputSchema.required ?? [] },
      },
    };
  }

  // OpenAI/Grok function names can't contain dots.
  private toToolName(id: string): string {
    return id.replace(/\./g, "__");
  }
  private fromToolName(name: string): string {
    return name.replace(/__/g, ".");
  }

  private safeParse(json: string): Record<string, unknown> {
    try {
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
