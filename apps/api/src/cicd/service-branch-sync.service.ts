import { Injectable, Logger } from "@nestjs/common";
import { CoolifyApiClient } from "./coolify-api.client";
import { DeployTargetsService } from "./deploy-targets.service";

@Injectable()
export class ServiceBranchSyncService {
  private readonly logger = new Logger(ServiceBranchSyncService.name);

  constructor(
    private readonly deployTargets: DeployTargetsService,
    private readonly coolify: CoolifyApiClient
  ) {}

  /** Persist branch on deploy_targets and push to Coolify when the app exists. */
  async syncBranches(
    tenantId: string,
    serviceId: string,
    branches: Partial<Record<"staging" | "production", string>>
  ): Promise<void> {
    for (const environment of ["staging", "production"] as const) {
      const branch = branches[environment]?.trim();
      if (!branch) continue;

      const target = await this.deployTargets.get(tenantId, serviceId, environment);
      if (!target) continue;

      if (target.branch === branch) continue;

      await this.deployTargets.updateBranch(tenantId, serviceId, environment, branch);

      if (!target.coolifyAppUuid) continue;

      try {
        await this.coolify.updateApplication(target.coolifyAppUuid, { git_branch: branch });
        this.logger.log(
          `Synced ${tenantId}/${serviceId}/${environment} branch → ${branch} (Coolify ${target.coolifyAppUuid})`
        );
      } catch (err) {
        this.logger.warn(
          `Coolify branch sync failed for ${tenantId}/${serviceId}/${environment}: ${(err as Error).message}`
        );
      }
    }
  }
}
