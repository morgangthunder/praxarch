import { Injectable, NotFoundException } from "@nestjs/common";
import { CoolifyEnvService } from "./coolify-env.service";
import { CoolifyProvisioningService } from "./coolify-provisioning.service";
import { CoolifyServersService } from "./coolify-servers.service";
import { DeployTargetsService } from "./deploy-targets.service";
import { ServiceBranchSyncService } from "./service-branch-sync.service";
import { ServicesService } from "./services.service";
import type { UpdateDeploymentDto } from "./dto/update-deployment.dto";
import type { DeployTargetBuildPack, DeployProfile, DeployTargetRecord } from "./deploy-targets.types";
import { normalizeDeployProfile } from "./compose-build-profiles";
import type { DeployServiceRecord } from "./services.types";
import { DEFAULT_PRODUCTION_BRANCH, DEFAULT_STAGING_BRANCH, resolveEnvironmentBranches } from "./branch-defaults";

export type WizardHosting = "local" | "cloud-split" | "cloud-single";

export interface WizardConfigResponse {
  serviceId: string;
  hosting: WizardHosting;
  type: string;
  name: string;
  repo: string;
  /** @deprecated Use stagingBranch / productionBranch */
  branch: string;
  stagingBranch: string;
  productionBranch: string;
  kind: "app" | "service";
  buildPack: DeployTargetBuildPack;
  portsExposes: string;
  stagingServerUuid: string;
  productionServerUuid: string;
  stagingEnvText: string;
  productionEnvText: string;
  stagingDeployProfile: DeployProfile;
  productionDeployProfile: DeployProfile;
  accessVerified: boolean;
  targets: {
    staging: { status: string; appUuid: string | null; serverUuid: string | null };
    production: { status: string; appUuid: string | null; serverUuid: string | null } | null;
  };
}

export interface UpdateDeploymentResult {
  service: DeployServiceRecord;
  provisions: {
    staging: Awaited<ReturnType<CoolifyProvisioningService["provision"]>>;
    production?: Awaited<ReturnType<CoolifyProvisioningService["provision"]>>;
  };
}

@Injectable()
export class DeploymentWizardService {
  constructor(
    private readonly services: ServicesService,
    private readonly deployTargets: DeployTargetsService,
    private readonly coolifyEnv: CoolifyEnvService,
    private readonly coolifyServers: CoolifyServersService,
    private readonly provisioning: CoolifyProvisioningService,
    private readonly branchSync: ServiceBranchSyncService
  ) {}

  async getConfig(tenantId: string, serviceId: string): Promise<WizardConfigResponse> {
    const service = await this.services.get(tenantId, serviceId);
    if (!service) throw new NotFoundException("Service not found");

    const staging = await this.deployTargets.get(tenantId, serviceId, "staging");
    const production = await this.deployTargets.get(tenantId, serviceId, "production");
    const servers = await this.coolifyServers.listForTenant(tenantId);

    const stagingServer = servers.find((s) => s.uuid === staging?.coolifyServerUuid);

    const hosting = this.inferHosting(staging, production, stagingServer?.platform);
    const buildPack = staging?.buildPack ?? "dockercompose";
    const stagingBranch =
      staging?.branch ??
      service.environments.find((e) => e.environment === "staging")?.branch ??
      DEFAULT_STAGING_BRANCH;
    const productionBranch =
      production?.branch ??
      service.environments.find((e) => e.environment === "production")?.branch ??
      DEFAULT_PRODUCTION_BRANCH;

    const stagingEnvs = await this.coolifyEnv.getVault(tenantId, serviceId, "staging");
    const productionEnvs = await this.coolifyEnv.getVault(tenantId, serviceId, "production");

    return {
      serviceId,
      hosting,
      type: this.inferWizardType(service.kind, buildPack),
      name: service.name,
      repo: service.repo,
      branch: stagingBranch,
      stagingBranch,
      productionBranch,
      kind: service.kind,
      buildPack,
      portsExposes: staging?.portsExposes ?? "3000",
      stagingServerUuid: staging?.coolifyServerUuid ?? "",
      productionServerUuid: production?.coolifyServerUuid ?? "",
      stagingEnvText: this.coolifyEnv.envToText(stagingEnvs),
      productionEnvText: this.coolifyEnv.envToText(productionEnvs),
      stagingDeployProfile: normalizeDeployProfile(staging?.deployProfile),
      productionDeployProfile: normalizeDeployProfile(production?.deployProfile),
      accessVerified: Boolean(staging?.coolifyAppUuid),
      targets: {
        staging: {
          status: staging?.status ?? "pending",
          appUuid: staging?.coolifyAppUuid ?? null,
          serverUuid: staging?.coolifyServerUuid ?? null,
        },
        production: production
          ? {
              status: production.status,
              appUuid: production.coolifyAppUuid,
              serverUuid: production.coolifyServerUuid,
            }
          : null,
      },
    };
  }

  async updateDeployment(
    tenantId: string,
    serviceId: string,
    dto: UpdateDeploymentDto
  ): Promise<UpdateDeploymentResult> {
    const service = await this.services.get(tenantId, serviceId);
    if (!service) throw new NotFoundException("Service not found");

    const branches = resolveEnvironmentBranches(dto);
    await this.services.updateConfig(tenantId, serviceId, {
      name: dto.name,
      repo: dto.repo,
      stagingBranch: branches.staging,
      productionBranch: branches.production,
    });

    const base = {
      tenantId,
      serviceId,
      repo: dto.repo,
      buildPack: dto.buildPack,
      portsExposes: dto.portsExposes,
      githubToken: dto.githubToken,
    };

    await this.deployTargets.patchWizardFields(tenantId, serviceId, "staging", {
      coolifyServerUuid: dto.staging.serverUuid,
      repo: dto.repo,
      branch: branches.staging,
      buildPack: dto.buildPack,
      portsExposes: dto.portsExposes,
      deployProfile: dto.stagingDeployProfile,
    });

    const staging = await this.provisioning.provision({
      ...base,
      branch: branches.staging,
      environment: "staging",
      coolifyServerUuid: dto.staging.serverUuid,
      appName: `${tenantId}-${serviceId}-staging`,
    });

    let production: UpdateDeploymentResult["provisions"]["production"];
    const productionServerUuid = dto.production?.serverUuid?.trim();
    if (productionServerUuid) {
      await this.deployTargets.patchWizardFields(tenantId, serviceId, "production", {
        coolifyServerUuid: productionServerUuid,
        repo: dto.repo,
        branch: branches.production,
        buildPack: dto.buildPack,
        portsExposes: dto.portsExposes,
        deployProfile: dto.productionDeployProfile,
      });
      production = await this.provisioning.provision({
        ...base,
        branch: branches.production,
        environment: "production",
        coolifyServerUuid: productionServerUuid,
        appName: `${tenantId}-${serviceId}-production`,
      });
    }

    if (dto.stagingEnvText !== undefined) {
      const merged = await this.coolifyEnv.setFromText(
        tenantId,
        serviceId,
        "staging",
        dto.stagingEnvText,
        false
      );
      await this.coolifyEnv.syncToApplication(staging.coolifyAppUuid, merged);
    }
    if (dto.productionEnvText !== undefined && production) {
      const merged = await this.coolifyEnv.setFromText(
        tenantId,
        serviceId,
        "production",
        dto.productionEnvText,
        false
      );
      await this.coolifyEnv.syncToApplication(production.coolifyAppUuid, merged);
    }

    await this.branchSync.syncBranches(tenantId, serviceId, {
      staging: branches.staging,
      production: productionServerUuid ? branches.production : undefined,
    });

    const updated = await this.services.get(tenantId, serviceId);
    return {
      service: updated!,
      provisions: { staging, production },
    };
  }

  private inferHosting(
    staging: DeployTargetRecord | null,
    production: DeployTargetRecord | null,
    stagingIsPlatform?: boolean
  ): WizardHosting {
    if (stagingIsPlatform) return "local";
    const stagingUuid = staging?.coolifyServerUuid;
    const productionUuid = production?.coolifyServerUuid;
    if (stagingUuid && productionUuid && stagingUuid === productionUuid) return "cloud-single";
    return "cloud-split";
  }

  private inferWizardType(kind: "app" | "service", buildPack: DeployTargetBuildPack): string {
    if (buildPack === "static") return "static";
    if (buildPack === "dockerfile") return "dockerfile";
    if (buildPack === "railpack") return "railpack";
    if (kind === "service" && buildPack === "nixpacks") return "api";
    return "web";
  }
}
