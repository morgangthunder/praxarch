import { CicdService } from "../cicd/cicd.service";
import { ServicesService } from "../cicd/services.service";
import { MarketingService } from "../marketing/marketing.service";
import { WhatsappService } from "../whatsapp/whatsapp.service";
import { WorkspaceSettingsService } from "../settings/workspace-settings.service";
import type { SocialPlatform } from "../marketing/contracts";
import { CapabilityContext, CapabilityDescriptor, CapabilityResult } from "./capability.types";

export interface CapabilityDeps {
  cicd: CicdService;
  services: ServicesService;
  marketing: MarketingService;
  whatsapp: WhatsappService;
  settings: WorkspaceSettingsService;
}

/** Does this caller hold the role that lets a high-risk action run un-gated? */
function entitledToAutoRun(ctx: CapabilityContext, role: string): boolean {
  return !ctx.requestApproval && ctx.tenant.roles.includes(role);
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/**
 * The capability catalogue. Each entry wraps an existing service so the logic
 * lives in one place; the registry adds validation, audit, and HITL routing.
 */
export function buildCapabilities(deps: CapabilityDeps): CapabilityDescriptor[] {
  const { cicd, services, marketing, whatsapp, settings } = deps;

  return [
    // ── Deployments: read ────────────────────────────────────────────────
    {
      id: "deployments.listServices",
      title: "List deployable services",
      domain: "deployments",
      kind: "query",
      risk: "low",
      credits: 1,
      description:
        "List the tenant's deployable services and their per-environment status (production/staging).",
      inputSchema: { properties: {} },
      handler: async (_input, ctx): Promise<CapabilityResult> => ({
        status: "ok",
        data: await services.list(ctx.tenant.tenantId),
      }),
    },

    // ── Deployments: configure ───────────────────────────────────────────
    {
      id: "deployments.createService",
      title: "Add a deployable service",
      domain: "deployments",
      kind: "command",
      risk: "medium",
      credits: 10,
      description:
        "Register a new deployable web app or service (name, git repo, default branch). Does not deploy it.",
      inputSchema: {
        properties: {
          name: { type: "string", description: "Human-readable service name." },
          repo: { type: "string", description: "Git repo, e.g. owner/name." },
          branch: { type: "string", description: "Default tracked branch (defaults to main)." },
          kind: { type: "string", enum: ["app", "service"], description: "app or service." },
        },
        required: ["name", "repo"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => ({
        status: "ok",
        data: await services.create(ctx.tenant.tenantId, {
          name: input.name as string,
          repo: input.repo as string,
          branch: str(input.branch),
          kind: (str(input.kind) as "app" | "service" | undefined) ?? "app",
        }),
      }),
    },
    {
      id: "deployments.updateServiceConfig",
      title: "Update service CI/CD config",
      domain: "deployments",
      kind: "command",
      risk: "medium",
      credits: 5,
      description: "Update a service's git repo and/or tracked branch.",
      inputSchema: {
        properties: {
          id: { type: "string", description: "Service id." },
          repo: { type: "string" },
          branch: { type: "string" },
        },
        required: ["id"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => {
        const updated = await services.updateConfig(ctx.tenant.tenantId, input.id as string, {
          repo: str(input.repo),
          branch: str(input.branch),
        });
        return updated
          ? { status: "ok", data: updated }
          : { status: "error", message: "Service not found" };
      },
    },

    // ── Deployments: ship ────────────────────────────────────────────────
    {
      id: "deployments.deployStaging",
      title: "Deploy to staging",
      domain: "deployments",
      kind: "command",
      risk: "medium",
      credits: 25,
      description: "Trigger a staging deploy for a service (project slug + optional git ref).",
      inputSchema: {
        properties: {
          project: { type: "string", description: "Service/project slug (kebab-case)." },
          ref: { type: "string", description: "Optional git ref; defaults to the tracked branch." },
        },
        required: ["project"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => ({
        status: "ok",
        data: await cicd.deploy(
          { project: input.project as string, environment: "staging", ref: str(input.ref) },
          ctx.tenant
        ),
      }),
    },
    {
      id: "deployments.promoteProduction",
      title: "Promote to production",
      domain: "deployments",
      kind: "command",
      risk: "high",
      credits: 50,
      description:
        "Promote a service to production. If the caller can't promote directly (or asks for approval), this opens a WhatsApp approval; on YES the deploy runs.",
      inputSchema: {
        properties: {
          project: { type: "string", description: "Service/project slug (kebab-case)." },
          ref: { type: "string", description: "Optional git ref." },
          summary: { type: "string", description: "Optional human-facing summary for the approver." },
        },
        required: ["project"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => {
        const project = input.project as string;
        const ref = str(input.ref);

        if (entitledToAutoRun(ctx, "platform:release")) {
          return {
            status: "ok",
            data: await cicd.deploy({ project, environment: "production", ref }, ctx.tenant),
          };
        }

        const approverWaId = await settings.resolveApprover(ctx.tenant.tenantId, "deploy");
        const summary =
          str(input.summary) ??
          `Promote *${project}* to *production*` +
            (ref ? ` (ref ${ref})` : "") +
            `\nRequested by ${ctx.actor ?? ctx.tenant.accountId}.`;
        const checkpoint = await whatsapp.openDeployCheckpoint({
          tenantId: ctx.tenant.tenantId,
          deploy: { project, environment: "production", ref },
          summary,
          approverWaId,
        });
        return {
          status: "awaiting_approval",
          checkpointId: checkpoint.id,
          message: "Production promote sent for WhatsApp approval.",
        };
      },
    },

    // ── Marketing: content publish ───────────────────────────────────────
    {
      id: "content.publish",
      title: "Publish marketing content",
      domain: "acquisition",
      kind: "command",
      risk: "high",
      credits: 25,
      description:
        "Publish a caption to one or more social platforms. High-stakes: routes to WhatsApp approval unless the caller is an owner running it directly.",
      inputSchema: {
        properties: {
          brandId: { type: "string" },
          platforms: { type: "array", items: "string", description: "e.g. instagram, facebook, linkedin." },
          caption: { type: "string" },
          hashtags: { type: "array", items: "string" },
          scheduledAt: { type: "string", description: "ISO time; omit for immediate." },
          summary: { type: "string" },
        },
        required: ["brandId", "platforms", "caption"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => {
        const payload = {
          brandId: input.brandId as string,
          platforms: input.platforms as SocialPlatform[],
          caption: input.caption as string,
          hashtags: (input.hashtags as string[] | undefined) ?? [],
          scheduledAt: str(input.scheduledAt),
        };

        if (entitledToAutoRun(ctx, "owner")) {
          return { status: "ok", data: await marketing.publishApprovedContent(payload, ctx.tenant.tenantId) };
        }

        const approverWaId = await settings.resolveApprover(ctx.tenant.tenantId, "content");
        const summary =
          str(input.summary) ??
          `Publish to ${payload.platforms.join(", ")}:\n"${payload.caption}"`;
        const checkpoint = await whatsapp.openContentCheckpoint({
          tenantId: ctx.tenant.tenantId,
          content: payload,
          summary,
          approverWaId,
        });
        return {
          status: "awaiting_approval",
          checkpointId: checkpoint.id,
          message: "Content sent for WhatsApp approval.",
        };
      },
    },
  ];
}
