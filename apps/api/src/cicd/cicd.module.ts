import { Module } from "@nestjs/common";
import { SecretsModule } from "../common/secrets/secrets.module";
import { CicdController } from "./cicd.controller";
import { CicdService } from "./cicd.service";
import { CoolifyApiClient } from "./coolify-api.client";
import { CoolifyProvisioningService } from "./coolify-provisioning.service";
import { CoolifyEnvService } from "./coolify-env.service";
import { CoolifyServersService } from "./coolify-servers.service";
import { ProvisionBundleService } from "./provision-bundle.service";
import { DeployRunsService } from "./deploy-runs.service";
import { DeployTargetsService } from "./deploy-targets.service";
import { ServiceBranchSyncService } from "./service-branch-sync.service";
import { ServicesService } from "./services.service";
import { ServerPreflightService } from "./server-preflight.service";
import { DeploymentWizardService } from "./deployment-wizard.service";
import { DeploymentDiagnoseService } from "./deployment-diagnose.service";
import { DeploymentComposeService } from "./deployment-compose.service";
import { ProdPostDeployService } from "./prod-post-deploy.service";
import { EcrReleaseService } from "./ecr-release.service";
import { EcrCiReadinessService } from "./ecr-ci-readiness.service";

@Module({
  imports: [SecretsModule],
  controllers: [CicdController],
  providers: [
    CicdService,
    CoolifyApiClient,
    CoolifyProvisioningService,
    CoolifyServersService,
    CoolifyEnvService,
    ProvisionBundleService,
    DeployRunsService,
    DeployTargetsService,
    ServicesService,
    ServiceBranchSyncService,
    ServerPreflightService,
    DeploymentWizardService,
    DeploymentDiagnoseService,
    DeploymentComposeService,
    ProdPostDeployService,
    EcrReleaseService,
    EcrCiReadinessService,
  ],
  exports: [
    CicdService,
    CoolifyApiClient,
    CoolifyProvisioningService,
    CoolifyServersService,
    CoolifyEnvService,
    ProvisionBundleService,
    DeployRunsService,
    DeployTargetsService,
    ServicesService,
    ServiceBranchSyncService,
    ServerPreflightService,
    DeploymentWizardService,
    DeploymentDiagnoseService,
    DeploymentComposeService,
    ProdPostDeployService,
    EcrReleaseService,
    EcrCiReadinessService,
  ],
})
export class CicdModule {}
