import { CicdService } from "../cicd/cicd.service";
import { CoolifyEnvService } from "../cicd/coolify-env.service";
import { CoolifyProvisioningService } from "../cicd/coolify-provisioning.service";
import { CoolifyServersService } from "../cicd/coolify-servers.service";
import { ProvisionBundleService } from "../cicd/provision-bundle.service";
import { ServicesService } from "../cicd/services.service";
import { GitHubService } from "../common/secrets/github.service";
import { MarketingService } from "../marketing/marketing.service";
import { WhatsappService } from "../whatsapp/whatsapp.service";
import { WorkspaceSettingsService } from "../settings/workspace-settings.service";
import { DeploymentDiagnoseService } from "../cicd/deployment-diagnose.service";
import { DeploymentComposeService } from "../cicd/deployment-compose.service";
import type { SocialPlatform } from "../marketing/contracts";
import { CapabilityContext, CapabilityDescriptor, CapabilityResult } from "./capability.types";

export interface CapabilityDeps {
  cicd: CicdService;
  provisioning: CoolifyProvisioningService;
  provisionBundle: ProvisionBundleService;
  coolifyServers: CoolifyServersService;
  coolifyEnv: CoolifyEnvService;
  github: GitHubService;
  services: ServicesService;
  marketing: MarketingService;
  whatsapp: WhatsappService;
  settings: WorkspaceSettingsService;
  deploymentDiagnose: DeploymentDiagnoseService;
  deploymentCompose: DeploymentComposeService;
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
  const {
    cicd,
    provisioning,
    provisionBundle,
    coolifyServers,
    coolifyEnv,
    github,
    services,
    marketing,
    whatsapp,
    settings,
    deploymentDiagnose,
    deploymentCompose,
  } = deps;

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

    // ── Deployments: infrastructure ──────────────────────────────────────
    {
      id: "deployments.listServers",
      title: "List deployment servers",
      domain: "deployments",
      kind: "query",
      risk: "low",
      credits: 1,
      description:
        "List Coolify servers available to this tenant (localhost + registered EC2/VPS).",
      inputSchema: { properties: {} },
      handler: async (_input, ctx): Promise<CapabilityResult> => ({
        status: "ok",
        data: await coolifyServers.listForTenant(ctx.tenant.tenantId),
      }),
    },
    {
      id: "deployments.registerServer",
      title: "Register EC2 / remote server",
      domain: "deployments",
      kind: "command",
      risk: "high",
      credits: 25,
      description:
        "Register a remote server with Coolify via SSH key. Validates SSH + Docker before returning. Owner role required.",
      inputSchema: {
        properties: {
          name: { type: "string", description: "Display name, e.g. staging-ec2." },
          host: { type: "string", description: "IP or DNS hostname." },
          port: { type: "number", description: "SSH port (default 22)." },
          user: { type: "string", description: "SSH user (default ubuntu/root)." },
          sshPrivateKey: { type: "string", description: "PEM private key — sent to Coolify only." },
        },
        required: ["name", "host", "sshPrivateKey"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => {
        if (!entitledToAutoRun(ctx, "owner")) {
          return { status: "error", message: "Server registration requires the owner role." };
        }
        return {
          status: "ok",
          data: await coolifyServers.register(ctx.tenant.tenantId, {
            name: input.name as string,
            host: input.host as string,
            port: typeof input.port === "number" ? input.port : undefined,
            user: str(input.user),
            sshPrivateKey: input.sshPrivateKey as string,
          }),
        };
      },
    },
    {
      id: "deployments.validateServer",
      title: "Validate deployment server",
      domain: "deployments",
      kind: "command",
      risk: "low",
      credits: 5,
      description: "Trigger SSH/Docker validation on a Coolify server and wait for readiness.",
      inputSchema: {
        properties: {
          serverUuid: { type: "string", description: "Coolify server UUID." },
        },
        required: ["serverUuid"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => ({
        status: "ok",
        data: await coolifyServers.validateAndWait(
          input.serverUuid as string,
          ctx.tenant.tenantId
        ),
      }),
    },
    {
      id: "deployments.verifyGitHubAccess",
      title: "Verify GitHub repo access",
      domain: "deployments",
      kind: "command",
      risk: "low",
      credits: 2,
      description: "Confirm a GitHub PAT can read a repository (wizard Access step).",
      inputSchema: {
        properties: {
          repo: { type: "string", description: "owner/name." },
          githubToken: { type: "string", description: "GitHub PAT with repo scope." },
        },
        required: ["repo", "githubToken"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => ({
        status: "ok",
        data: await github.verifyRepoAccess(input.repo as string, input.githubToken as string),
      }),
    },

    // ── Deployments: env secrets ─────────────────────────────────────────
    {
      id: "deployments.getServiceEnvVars",
      title: "Get service environment variables",
      domain: "deployments",
      kind: "query",
      risk: "medium",
      credits: 2,
      description:
        "Read gitignored env vars for a service/environment from the encrypted vault (.env format).",
      inputSchema: {
        properties: {
          serviceId: { type: "string" },
          environment: { type: "string", enum: ["staging", "production"] },
        },
        required: ["serviceId", "environment"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => {
        const environment = input.environment as "staging" | "production";
        const envs = await coolifyEnv.getVault(ctx.tenant.tenantId, input.serviceId as string, environment);
        return {
          status: "ok",
          data: { environment, keys: Object.keys(envs), envText: coolifyEnv.envToText(envs) },
        };
      },
    },
    {
      id: "deployments.setServiceEnvVars",
      title: "Set service environment variables",
      domain: "deployments",
      kind: "command",
      risk: "high",
      credits: 10,
      description:
        "Update gitignored env vars (KEY=VALUE lines). Stores in vault and syncs to Coolify. Owner role required.",
      inputSchema: {
        properties: {
          serviceId: { type: "string" },
          environment: { type: "string", enum: ["staging", "production"] },
          envText: { type: "string", description: ".env-style KEY=VALUE lines." },
          merge: { type: "boolean", description: "Merge with existing vars (default false = replace)." },
          syncToCoolify: { type: "boolean", description: "Push to Coolify immediately (default true)." },
        },
        required: ["serviceId", "environment", "envText"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => {
        if (!entitledToAutoRun(ctx, "owner")) {
          return { status: "error", message: "Setting env vars requires the owner role." };
        }
        const environment = input.environment as "staging" | "production";
        const serviceId = input.serviceId as string;
        const merged = await coolifyEnv.setFromText(
          ctx.tenant.tenantId,
          serviceId,
          environment,
          input.envText as string,
          Boolean(input.merge)
        );
        const sync = input.syncToCoolify !== false;
        const syncResult = sync
          ? await coolifyEnv.syncServiceEnvironment(ctx.tenant.tenantId, serviceId, environment)
          : null;
        return {
          status: "ok",
          data: { keys: Object.keys(merged), synced: syncResult?.synced ?? 0 },
        };
      },
    },
    {
      id: "deployments.syncServiceEnvVars",
      title: "Sync env vars to Coolify",
      domain: "deployments",
      kind: "command",
      risk: "medium",
      credits: 5,
      description: "Push vault-stored env vars to the provisioned Coolify app (also runs before deploy).",
      inputSchema: {
        properties: {
          serviceId: { type: "string" },
          environment: { type: "string", enum: ["staging", "production"] },
        },
        required: ["serviceId", "environment"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => ({
        status: "ok",
        data: await coolifyEnv.syncServiceEnvironment(
          ctx.tenant.tenantId,
          input.serviceId as string,
          input.environment as "staging" | "production"
        ),
      }),
    },
    {
      id: "deployments.compareServiceEnvKeys",
      title: "Compare staging vs production env keys",
      domain: "deployments",
      kind: "query",
      risk: "low",
      credits: 2,
      description:
        "Compare which env var keys exist in staging vs production vaults. Reports whether ADMIN_SECRET/JWT_SECRET match (boolean only — never returns values).",
      inputSchema: {
        properties: {
          serviceId: { type: "string" },
        },
        required: ["serviceId"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => ({
        status: "ok",
        data: await deploymentDiagnose.compareEnvKeys(
          ctx.tenant.tenantId,
          input.serviceId as string
        ),
      }),
    },
    {
      id: "deployments.diagnoseEnvironment",
      title: "Diagnose a deployment environment",
      domain: "deployments",
      kind: "query",
      risk: "medium",
      credits: 15,
      description:
        "Read-only troubleshooting: server preflight, port/curl checks, redacted container log tail. Use when deploy succeeded but the site is down or unhealthy.",
      inputSchema: {
        properties: {
          serviceId: { type: "string" },
          environment: { type: "string", enum: ["staging", "production"] },
        },
        required: ["serviceId", "environment"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => ({
        status: "ok",
        data: await deploymentDiagnose.diagnose(
          ctx.tenant.tenantId,
          input.serviceId as string,
          input.environment as "staging" | "production"
        ),
      }),
    },
    {
      id: "deployments.mirrorEnvKeyFromProduction",
      title: "Mirror an env key from production to staging",
      domain: "deployments",
      kind: "command",
      risk: "high",
      credits: 10,
      description:
        "Copy ADMIN_SECRET, JWT_SECRET, or SESSION_SECRET from production vault to staging and sync to Coolify. Value is never returned. Owner role required.",
      inputSchema: {
        properties: {
          serviceId: { type: "string" },
          key: { type: "string", enum: ["ADMIN_SECRET", "JWT_SECRET", "SESSION_SECRET"] },
        },
        required: ["serviceId", "key"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => {
        if (!entitledToAutoRun(ctx, "owner")) {
          return { status: "error", message: "Mirroring secrets requires the owner role." };
        }
        return {
          status: "ok",
          data: await deploymentDiagnose.mirrorKeyFromProduction(
            ctx.tenant.tenantId,
            input.serviceId as string,
            input.key as string
          ),
        };
      },
    },
    {
      id: "deployments.ensureJwtSigningSecret",
      title: "Ensure JWT signing secret (legacy `secret` key)",
      domain: "deployments",
      kind: "command",
      risk: "high",
      credits: 10,
      description:
        "Set lowercase `secret` from ADMIN_SECRET/JWT_SECRET when missing. Bubblbook and similar apps use process.env.secret for jwt.sign. Syncs to Coolify; redeploy to apply in containers.",
      inputSchema: {
        properties: {
          serviceId: { type: "string" },
          environment: { type: "string", enum: ["staging", "production"] },
        },
        required: ["serviceId", "environment"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => {
        if (!entitledToAutoRun(ctx, "owner")) {
          return { status: "error", message: "Setting JWT secrets requires the owner role." };
        }
        return {
          status: "ok",
          data: await deploymentDiagnose.ensureJwtSigningSecret(
            ctx.tenant.tenantId,
            input.serviceId as string,
            input.environment as "staging" | "production"
          ),
        };
      },
    },
    {
      id: "deployments.buildFromSource",
      title: "Build app from repo Dockerfile (fix stale registry image)",
      domain: "deployments",
      kind: "command",
      risk: "high",
      credits: 50,
      description:
        "When docker-compose pins an old registry/ECR image but git has newer code, apply a Praxarch compose overlay, build app from Dockerfile, and restart (optionally with MCP). Takes several minutes. Owner role required.",
      inputSchema: {
        properties: {
          serviceId: { type: "string" },
          environment: { type: "string", enum: ["staging", "production"] },
          includeMcp: { type: "boolean", description: "Also start docker-compose.mcp.yml (default true)." },
          waitForCompletion: {
            type: "boolean",
            description: "Block until build finishes (~15–20 min). Default false — starts in background on the host.",
          },
        },
        required: ["serviceId", "environment"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => {
        if (!entitledToAutoRun(ctx, "owner")) {
          return { status: "error", message: "Building from source requires the owner role." };
        }
        return {
          status: "ok",
          data: await deploymentCompose.buildFromSource(
            ctx.tenant.tenantId,
            input.serviceId as string,
            input.environment as "staging" | "production",
            { includeMcp: input.includeMcp !== false, waitForCompletion: input.waitForCompletion === true }
          ),
        };
      },
    },
    {
      id: "deployments.ensureMcpOverlay",
      title: "Start MCP compose overlay",
      domain: "deployments",
      kind: "command",
      risk: "medium",
      credits: 15,
      description:
        "Start the mcp service from docker-compose.mcp.yml (onboarding agent). Coolify deploy alone does not include this overlay.",
      inputSchema: {
        properties: {
          serviceId: { type: "string" },
          environment: { type: "string", enum: ["staging", "production"] },
        },
        required: ["serviceId", "environment"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => ({
        status: "ok",
        data: await deploymentCompose.ensureMcpOverlay(
          ctx.tenant.tenantId,
          input.serviceId as string,
          input.environment as "staging" | "production"
        ),
      }),
    },

    // ── Deployments: provision ───────────────────────────────────────────
    {
      id: "deployments.provisionDeployment",
      title: "Full deployment provision (wizard equivalent)",
      domain: "deployments",
      kind: "command",
      risk: "high",
      credits: 100,
      description:
        "End-to-end provision like the Add deployment wizard: create service, provision staging + production on Coolify, inject env secrets. Owner role required.",
      inputSchema: {
        properties: {
          name: { type: "string" },
          repo: { type: "string" },
          branch: { type: "string" },
          kind: { type: "string", enum: ["app", "service"] },
          hosting: { type: "string", enum: ["local", "cloud-split", "cloud-single"] },
          buildPack: {
            type: "string",
            enum: ["nixpacks", "dockercompose", "dockerfile", "static", "railpack"],
          },
          portsExposes: { type: "string" },
          githubToken: { type: "string" },
          stagingServerUuid: { type: "string" },
          productionServerUuid: { type: "string" },
          stagingEnvText: { type: "string" },
          productionEnvText: { type: "string" },
        },
        required: ["name", "repo", "stagingServerUuid", "productionServerUuid"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => {
        if (!entitledToAutoRun(ctx, "owner")) {
          return { status: "error", message: "Full provisioning requires the owner role." };
        }
        return {
          status: "ok",
          data: await provisionBundle.provision(ctx.tenant.tenantId, {
            name: input.name as string,
            repo: input.repo as string,
            branch: str(input.branch),
            kind: (str(input.kind) as "app" | "service" | undefined) ?? "app",
            hosting: str(input.hosting) as "local" | "cloud-split" | "cloud-single" | undefined,
            buildPack: str(input.buildPack) as
              | "nixpacks"
              | "dockercompose"
              | "dockerfile"
              | "static"
              | "railpack"
              | undefined,
            portsExposes: str(input.portsExposes),
            githubToken: str(input.githubToken),
            stagingEnvText: str(input.stagingEnvText),
            productionEnvText: str(input.productionEnvText),
            staging: { serverUuid: input.stagingServerUuid as string },
            production: { serverUuid: input.productionServerUuid as string },
          }),
        };
      },
    },
    {
      id: "deployments.provisionService",
      title: "Provision Coolify app for a service",
      domain: "deployments",
      kind: "command",
      risk: "high",
      credits: 75,
      description:
        "Create (or resume) a Coolify application for a tenant service/environment: project, deploy key (private repos), app, and deploy_targets row. Requires owner role.",
      inputSchema: {
        properties: {
          serviceId: { type: "string", description: "Service id, e.g. web." },
          environment: {
            type: "string",
            enum: ["staging", "production"],
            description: "Target environment.",
          },
          repo: { type: "string", description: "GitHub repo owner/name or URL." },
          branch: { type: "string", description: "Tracked branch (default main)." },
          buildPack: {
            type: "string",
            enum: ["nixpacks", "dockercompose", "dockerfile", "static", "railpack"],
            description: "Coolify build pack (default dockercompose).",
          },
          portsExposes: { type: "string", description: "Container port to expose (default 3000)." },
          githubToken: {
            type: "string",
            description: "GitHub PAT for private repos (repo admin). Stored encrypted.",
          },
          appName: { type: "string", description: "Optional Coolify application name." },
          coolifyServerUuid: {
            type: "string",
            description: "Coolify server UUID (EC2, localhost, etc.).",
          },
        },
        required: ["serviceId", "environment", "repo"],
      },
      handler: async (input, ctx): Promise<CapabilityResult> => {
        if (!entitledToAutoRun(ctx, "owner")) {
          return {
            status: "error",
            message: "Provisioning requires the owner role (WhatsApp HITL in a later gate).",
          };
        }
        const environment = input.environment as "staging" | "production";
        return {
          status: "ok",
          data: await provisioning.provision({
            tenantId: ctx.tenant.tenantId,
            serviceId: input.serviceId as string,
            environment,
            repo: input.repo as string,
            branch: str(input.branch),
            buildPack: str(input.buildPack) as
              | "nixpacks"
              | "dockercompose"
              | "dockerfile"
              | "static"
              | "railpack"
              | undefined,
            portsExposes: str(input.portsExposes),
            githubToken: str(input.githubToken),
            appName: str(input.appName),
            coolifyServerUuid: str(input.coolifyServerUuid),
          }),
        };
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
