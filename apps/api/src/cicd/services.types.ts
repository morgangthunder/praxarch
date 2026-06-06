export type DeployEnvironmentName = "production" | "staging";

export interface ServiceEnvironment {
  environment: DeployEnvironmentName;
  branch: string;
  commit: string;
  version: string;
  status: string;
  deployedAt: string;
  aheadOfProd?: boolean;
  /** Coolify application UUID for this environment (overrides env-var lookup). */
  coolifyAppUuid?: string;
}

export interface DeployServiceRecord {
  id: string;
  name: string;
  repo: string;
  kind: "app" | "service";
  environments: ServiceEnvironment[];
}
