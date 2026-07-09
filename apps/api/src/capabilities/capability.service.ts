import { HttpException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
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
import { CapabilityRegistry } from "./capability.registry";
import { buildCapabilities } from "./capability.definitions";
import { CapabilityAuditService } from "./capability-audit.service";
import {
  CapabilityContext,
  CapabilityResult,
  CapabilitySummary,
} from "./capability.types";

/**
 * Single dispatch point for typed actions. The UI, the in-app assistant, and a
 * future MCP server all call `dispatch`, which validates input, runs the wrapped
 * service (high-risk actions self-route to WhatsApp HITL), and audits + meters.
 *
 * RBAC for low/medium actions is enforced by the wrapped services (which throw);
 * high-risk actions decide auto-run vs approval inside their handler.
 */
@Injectable()
export class CapabilityService implements OnModuleInit {
  private readonly logger = new Logger(CapabilityService.name);
  private readonly registry = new CapabilityRegistry();

  constructor(
    private readonly cicd: CicdService,
    private readonly provisioning: CoolifyProvisioningService,
    private readonly provisionBundle: ProvisionBundleService,
    private readonly coolifyServers: CoolifyServersService,
    private readonly coolifyEnv: CoolifyEnvService,
    private readonly github: GitHubService,
    private readonly services: ServicesService,
    private readonly marketing: MarketingService,
    private readonly whatsapp: WhatsappService,
    private readonly settings: WorkspaceSettingsService,
    private readonly deploymentDiagnose: DeploymentDiagnoseService,
    private readonly deploymentCompose: DeploymentComposeService,
    private readonly audit: CapabilityAuditService
  ) {}

  onModuleInit(): void {
    this.registry.register(
      buildCapabilities({
        cicd: this.cicd,
        provisioning: this.provisioning,
        provisionBundle: this.provisionBundle,
        coolifyServers: this.coolifyServers,
        coolifyEnv: this.coolifyEnv,
        github: this.github,
        services: this.services,
        marketing: this.marketing,
        whatsapp: this.whatsapp,
        settings: this.settings,
        deploymentDiagnose: this.deploymentDiagnose,
        deploymentCompose: this.deploymentCompose,
      })
    );
    this.logger.log(`Registered ${this.registry.list().length} capabilities.`);
  }

  list(): CapabilitySummary[] {
    return this.registry.list();
  }

  async dispatch(
    capabilityId: string,
    input: Record<string, unknown>,
    ctx: CapabilityContext
  ): Promise<CapabilityResult> {
    const cap = this.registry.get(capabilityId);
    if (!cap) throw new NotFoundException(`Unknown capability: ${capabilityId}`);

    this.registry.validate(cap.inputSchema, input);

    const actor = ctx.actor ?? ctx.tenant.accountId;
    try {
      const result = await cap.handler(input, ctx);
      await this.audit.record({
        tenantId: ctx.tenant.tenantId,
        capabilityId,
        source: ctx.source,
        actor,
        status: result.status,
        credits: result.status === "error" ? 0 : cap.credits,
        input: redactCapabilityInput(input),
        result: result.data ?? result.message ?? null,
      });
      return result;
    } catch (err) {
      const message = err instanceof HttpException ? err.message : (err as Error).message;
      await this.audit.record({
        tenantId: ctx.tenant.tenantId,
        capabilityId,
        source: ctx.source,
        actor,
        status: "error",
        credits: 0,
        input: redactCapabilityInput(input),
        result: message,
      });
      throw err;
    }
  }
}

function redactCapabilityInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  for (const key of Object.keys(out)) {
    if (/token|secret|password|key|envtext|privatekey/i.test(key) && typeof out[key] === "string") {
      out[key] = "[redacted]";
    }
  }
  return out;
}
