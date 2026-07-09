import { Injectable } from "@nestjs/common";

import { CoolifyEnvService } from "./coolify-env.service";

import { CoolifyProvisioningService } from "./coolify-provisioning.service";

import { parseEnvText } from "./parse-env-vars";

import { ServicesService } from "./services.service";

import { DeployTargetsService } from "./deploy-targets.service";

import { ServiceBranchSyncService } from "./service-branch-sync.service";

import { resolveEnvironmentBranches } from "./branch-defaults";

import type { ProvisionDeploymentDto } from "./dto/provision.dto";

import type { DeployServiceRecord } from "./services.types";



export interface ProvisionBundleResult {

  service: DeployServiceRecord;

  provisions: {

    staging: Awaited<ReturnType<CoolifyProvisioningService["provision"]>>;

    production?: Awaited<ReturnType<CoolifyProvisioningService["provision"]>>;

  };

  hosting: "local" | "cloud-split" | "cloud-single";

}



/** Full wizard / assistant provision flow — shared by REST and capabilities. */

@Injectable()

export class ProvisionBundleService {

  constructor(

    private readonly services: ServicesService,

    private readonly provisioning: CoolifyProvisioningService,

    private readonly coolifyEnv: CoolifyEnvService,

    private readonly deployTargets: DeployTargetsService,

    private readonly branchSync: ServiceBranchSyncService

  ) {}



  async provision(tenantId: string, dto: ProvisionDeploymentDto): Promise<ProvisionBundleResult> {

    const branches = resolveEnvironmentBranches(dto);

    const service = await this.services.create(tenantId, {

      name: dto.name,

      repo: dto.repo,

      stagingBranch: branches.staging,

      productionBranch: branches.production,

      kind: dto.kind,

    });



    const base = {

      tenantId,

      serviceId: service.id,

      repo: dto.repo,

      buildPack: dto.buildPack,

      portsExposes: dto.portsExposes,

      githubToken: dto.githubToken,

    };



    const staging = await this.provisioning.provision({

      ...base,

      branch: branches.staging,

      environment: "staging",

      coolifyServerUuid: dto.staging.serverUuid,

      appName: `${tenantId}-${service.id}-staging`,

    });



    if (dto.stagingDeployProfile) {
      await this.deployTargets.patchWizardFields(tenantId, service.id, "staging", {
        deployProfile: dto.stagingDeployProfile,
      });
    }

    const productionServerUuid = dto.production?.serverUuid?.trim();

    let production: ProvisionBundleResult["provisions"]["production"];

    if (productionServerUuid) {

      production = await this.provisioning.provision({

        ...base,

        branch: branches.production,

        environment: "production",

        coolifyServerUuid: productionServerUuid,

        appName: `${tenantId}-${service.id}-production`,

      });

    }

    if (production && dto.productionDeployProfile) {
      await this.deployTargets.patchWizardFields(tenantId, service.id, "production", {
        deployProfile: dto.productionDeployProfile,
      });
    }



    const stagingEnvs = dto.stagingEnvText ? parseEnvText(dto.stagingEnvText) : {};

    const productionEnvs = dto.productionEnvText ? parseEnvText(dto.productionEnvText) : {};



    await this.coolifyEnv.storeVault(tenantId, service.id, "staging", stagingEnvs);

    if (productionEnvs && Object.keys(productionEnvs).length > 0) {

      await this.coolifyEnv.storeVault(tenantId, service.id, "production", productionEnvs);

    }

    await this.coolifyEnv.syncToApplication(staging.coolifyAppUuid, stagingEnvs);

    if (production) {

      await this.coolifyEnv.syncToApplication(production.coolifyAppUuid, productionEnvs);

    }



    await this.branchSync.syncBranches(tenantId, service.id, {

      staging: branches.staging,

      production: productionServerUuid ? branches.production : undefined,

    });



    return {

      service,

      provisions: { staging, production },

      hosting: dto.hosting ?? "cloud-split",

    };

  }

}


