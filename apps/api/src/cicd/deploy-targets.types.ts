export type DeployTargetStatus = "pending" | "provisioning" | "ready" | "error";

export type DeployTargetAuthMethod = "deploy_key" | "github_app";

export type DeployTargetBuildPack =
  | "nixpacks"
  | "railpack"
  | "static"
  | "dockerfile"
  | "dockercompose";

export type DeployProfile = "coolify" | "source-compose" | "source-compose-host";

export interface DeployProfileOptions {
  envFilePath?: string;
  includeMcpOverlay?: boolean;
  minDiskMb?: number;
  /** Existing Docker volume name for Mongo (avoids Coolify creating an empty hyphen volume). */
  mongoDataVolume?: string;
  /** ECR image repository (enables build → GitHub pin → Coolify on production deploy). */
  ecrRepository?: string;
  ecrRegion?: string;
  /** Rolling ECR tag written to docker-compose.yml (e.g. v2). */
  ecrImageTag?: string;
  /** Coolify server UUID used for off-box docker build + ECR push. */
  ecrBuildServerUuid?: string;
  /** Skip docker build — redeploy existing ECR tag only. */
  ecrSkipBuild?: boolean;
}

export interface DeployTargetRecord {
  id: string;
  tenantId: string;
  serviceId: string;
  environment: "staging" | "production";
  coolifyServerUuid: string | null;
  coolifyProjectUuid: string | null;
  coolifyAppUuid: string | null;
  coolifyEnvUuid: string | null;
  repo: string;
  branch: string;
  gitProvider: string;
  authMethod: DeployTargetAuthMethod;
  privateKeyUuid: string | null;
  buildPack: DeployTargetBuildPack;
  portsExposes: string;
  status: DeployTargetStatus;
  errorMessage: string | null;
  deployProfile: DeployProfile;
  deployProfileOptions: DeployProfileOptions;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertDeployTargetInput {
  id: string;
  tenantId: string;
  serviceId: string;
  environment: "staging" | "production";
  coolifyServerUuid?: string;
  repo: string;
  branch?: string;
  gitProvider?: string;
  authMethod?: DeployTargetAuthMethod;
  buildPack?: DeployTargetBuildPack;
  portsExposes?: string;
  status?: DeployTargetStatus;
}
