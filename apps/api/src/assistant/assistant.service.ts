import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { CapabilityService } from "../capabilities/capability.service";
import type { CapabilitySummary } from "../capabilities/capability.types";
import type { TenantContext } from "../common/tenant/tenant-context";
import { DEFAULT_ASSISTANT_CASE_KEY, type ContextFieldsConfig } from "../prompts/ai-case.types";
import { ASSISTANT_DEPLOYMENTS_TROUBLESHOOTING_KEY } from "../prompts/prompt-registry.types";
import { AssistantCaseService } from "../prompts/assistant-case.service";
import { PromptRegistryService } from "../prompts/prompt-registry.service";
import { ChatMessage, LlmClient, ToolDefinition } from "./llm.client";

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
  /** The caller's workspace identity (owner/member/viewer/super_admin). */
  role?: string;
  module?: string;
  route?: string;
  wizardStep?: string;
  wizardHosting?: string;
  wizardStepIndex?: string;
  wizardRepo?: string;
  wizardName?: string;
}

const MAX_TOOL_ROUNDS = 5;

/**
 * In-app agentic assistant. Exposes the Capability registry to Grok as tools and
 * dispatches tool calls through the same guarded path the UI uses (so RBAC,
 * autonomy/HITL, audit, and credit metering all apply). When no Grok key is set,
 * a deterministic placeholder still routes a few common deployment commands.
 */
@Injectable()
export class AssistantService implements OnModuleInit {
  private readonly logger = new Logger(AssistantService.name);
  private readonly llm = new LlmClient(process.env);

  constructor(
    private readonly capabilities: CapabilityService,
    private readonly prompts: PromptRegistryService,
    private readonly cases: AssistantCaseService
  ) {}

  /** Surface the running case/model on boot (per project convention). */
  async onModuleInit(): Promise<void> {
    const resolved = await this.cases.resolve(DEFAULT_ASSISTANT_CASE_KEY);
    if (resolved.providerConfigured) {
      this.logger.log(
        `Assistant ready — case "${resolved.label}" → ${resolved.modelProvider}/${resolved.modelId} via ${resolved.resolvedBaseUrl}.`
      );
    } else {
      const fb = this.llm.describeFallback();
      this.logger.log(
        `Assistant in placeholder mode — configure API key for ${resolved.modelProvider} (env fallback model "${fb.model}").`
      );
    }
  }

  async *stream(history: ChatTurn[], ctx: AssistantContext): AsyncGenerator<AssistantEvent> {
    try {
      const aiCase = await this.cases.resolve(DEFAULT_ASSISTANT_CASE_KEY);
      if (this.llm.isConfigured({ provider: aiCase.modelProvider, model: aiCase.modelId, baseUrl: aiCase.resolvedBaseUrl })) {
        yield* this.streamWithLlm(history, ctx, aiCase);
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

  // ── LLM tool-calling loop (model from super-admin case config) ─────────
  private async *streamWithLlm(
    history: ChatTurn[],
    ctx: AssistantContext,
    aiCase: Awaited<ReturnType<AssistantCaseService["resolve"]>>
  ): AsyncGenerator<AssistantEvent> {
    const caps = this.capabilities.list();
    const tools = caps.map((c) => this.toToolDefinition(c));
    const llmConfig = {
      provider: aiCase.modelProvider,
      model: aiCase.modelId,
      baseUrl: aiCase.resolvedBaseUrl,
    };
    const messages: ChatMessage[] = [
      { role: "system", content: await this.systemPrompt(ctx, aiCase) },
      ...history.map((t) => ({ role: t.role, content: t.content } as ChatMessage)),
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const { message } = await this.llm.chat(llmConfig, messages, tools);
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

  /**
   * Composed every turn: editable guardrail + persona (super-admin Prompt
   * Registry), then an auto-generated context block reflecting where the user
   * is, then the live tool catalogue. Order matters — guardrails first.
   */
  private async systemPrompt(
    ctx: AssistantContext,
    aiCase: Awaited<ReturnType<AssistantCaseService["resolve"]>>
  ): Promise<string> {
    const { guardrail, behavior } = await this.prompts.composeForCase(
      aiCase.guardrailPromptKey,
      aiCase.behaviorPromptKey
    );
    const parts = [guardrail, behavior];
    if (ctx.module === "deployments") {
      try {
        const troubleshoot = await this.prompts.resolveBody(ASSISTANT_DEPLOYMENTS_TROUBLESHOOTING_KEY);
        parts.push(troubleshoot);
      } catch {
        /* prompt optional */
      }
    }
    const ctxBlock = this.contextBlock(ctx, aiCase.contextFields);
    if (ctxBlock) parts.push(ctxBlock);
    if (aiCase.contextFields.tools) parts.push(this.toolsBlock());
    return parts.filter((s) => s && s.trim()).join("\n\n");
  }

  /** Context block — only fields enabled for this assistant case. */
  private contextBlock(ctx: AssistantContext, fields: ContextFieldsConfig): string | null {
    const lines: string[] = ["## Current context"];
    let any = false;

    if (fields.tenant) {
      lines.push(`- Active tenant: ${ctx.tenant.tenantId}`);
      any = true;
    }
    if (fields.userRole) {
      lines.push(`- User role: ${ctx.role ?? this.inferRole(ctx.tenant)}`);
      any = true;
    }
    if (fields.tenantRoles) {
      lines.push(`- Tenant roles (server-verified): ${ctx.tenant.roles.join(", ") || "none"}`);
      any = true;
    }
    if (fields.currentTime) {
      lines.push(`- Current time: ${new Date().toISOString()}`);
      any = true;
    }
    if (fields.wizardStep && ctx.wizardStep) {
      lines.push(`- Location: Add-deployment wizard, step "${ctx.wizardStep}"`);
      any = true;
    }
    if (fields.wizardHosting && ctx.wizardHosting) {
      lines.push(`- Hosting topology: ${ctx.wizardHosting}`);
      any = true;
    }
    if (ctx.wizardStepIndex) {
      lines.push(`- Wizard step number: ${ctx.wizardStepIndex}`);
      any = true;
    }
    if (ctx.wizardName) {
      lines.push(`- Service name (draft): ${ctx.wizardName}`);
      any = true;
    }
    if (ctx.wizardRepo) {
      lines.push(`- Repo (draft): ${ctx.wizardRepo}`);
      any = true;
    }
    if (fields.wizardStep && ctx.wizardStep) {
      lines.push(
        "- Guidance: work through this step only; verify GitHub access and validate servers before advancing."
      );
    } else if (fields.module && ctx.module) {
      lines.push(`- Location: "${ctx.module}" module${fields.route && ctx.route ? ` (${ctx.route})` : ""}`);
      if (ctx.module === "deployments") {
        lines.push(
          "- Guidance: for deploy failures or 502 errors, call deployments.diagnoseEnvironment and deployments.compareServiceEnvKeys before suggesting fixes."
        );
      }
      any = true;
    } else if (fields.route && ctx.route) {
      lines.push(`- Location: ${ctx.route}`);
      any = true;
    }

    return any ? lines.join("\n") : null;
  }

  private toolsBlock(): string {
    const deploymentTools = [
      "deployments.listServices",
      "deployments.listServers",
      "deployments.registerServer",
      "deployments.validateServer",
      "deployments.verifyGitHubAccess",
      "deployments.provisionDeployment (full wizard flow)",
      "deployments.provisionService (single environment)",
      "deployments.getServiceEnvVars / setServiceEnvVars / syncServiceEnvVars",
      "deployments.compareServiceEnvKeys (staging vs production key gaps)",
      "deployments.diagnoseEnvironment (read-only SSH/curl/log probe; detects stale-prebuilt-image)",
      "deployments.buildFromSource (build app from Dockerfile when ECR/registry image is older than git)",
      "deployments.ensureMcpOverlay (start docker-compose.mcp.yml)",
      "deployments.mirrorEnvKeyFromProduction (copy ADMIN_SECRET etc. prod→staging)",
      "deployments.ensureJwtSigningSecret (set lowercase secret from ADMIN_SECRET for legacy JWT apps)",
      "deployments.deployStaging / deployments.promoteProduction",
    ];
    return [
      "## Tools",
      "Every UI action has a matching tool; the full schema is provided separately. Key deployment tools:",
      ...deploymentTools.map((t) => `- ${t}`),
    ].join("\n");
  }

  /** Best-effort role label from server-verified roles when the UI didn't send one. */
  private inferRole(tenant: TenantContext): string {
    if (tenant.roles.includes("platform:operator")) return "super_admin";
    if (tenant.roles.includes("owner")) return "owner";
    return tenant.roles[0] ?? "unknown";
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
