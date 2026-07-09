import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { generateDeployKeyPair } from "../common/secrets/generate-deploy-key";
import { GitHubService } from "../common/secrets/github.service";
import { SecretsService } from "../common/secrets/secrets.service";
import { CoolifyApiClient } from "./coolify-api.client";
import { DeployTargetsService } from "./deploy-targets.service";
import type { DeployTargetBuildPack, DeployTargetRecord } from "./deploy-targets.types";

export interface ProvisionServiceInput {
  tenantId: string;
  serviceId: string;
  environment: "staging" | "production";
  repo: string;
  branch?: string;
  buildPack?: DeployTargetBuildPack;
  portsExposes?: string;
  /** Coolify server UUID (localhost, EC2, etc.) — required for new provisions. */
  coolifyServerUuid?: string;
  /** Required for private repos — stored encrypted in tenant_secrets. */
  githubToken?: string;
  appName?: string;
}

export interface ProvisionServiceResult {
  target: DeployTargetRecord;
  coolifyAppUuid: string;
  resumed: boolean;
}

@Injectable()
export class CoolifyProvisioningService {
  private readonly logger = new Logger(CoolifyProvisioningService.name);

  constructor(
    private readonly coolify: CoolifyApiClient,
    private readonly deployTargets: DeployTargetsService,
    private readonly github: GitHubService,
    private readonly secrets: SecretsService
  ) {}

  async provision(input: ProvisionServiceInput): Promise<ProvisionServiceResult> {
    const branch = input.branch ?? "main";
    const buildPack = input.buildPack ?? "dockercompose";
    const portsExposes = input.portsExposes ?? "3000";
    const isPrivate = Boolean(input.githubToken);

    let target = await this.deployTargets.get(input.tenantId, input.serviceId, input.environment);
    if (target?.status === "ready" && target.coolifyAppUuid) {
      return { target, coolifyAppUuid: target.coolifyAppUuid, resumed: true };
    }

    const targetId = target?.id ?? randomUUID();
    target = await this.deployTargets.upsert({
      id: targetId,
      tenantId: input.tenantId,
      serviceId: input.serviceId,
      environment: input.environment,
      coolifyServerUuid: input.coolifyServerUuid,
      repo: input.repo,
      branch,
      buildPack,
      portsExposes,
      status: "provisioning",
    });

    if (input.githubToken) {
      await this.secrets.put(input.tenantId, "github.provisioning", input.githubToken);
    }

    try {
      const serverUuid = await this.coolify.resolveServerUuid(
        input.coolifyServerUuid ?? target.coolifyServerUuid ?? undefined
      );
      const projectName = `praxarch-${input.tenantId}`;
      const projectUuid = await this.ensureProject(projectName, input.tenantId);
      const environmentUuid = await this.ensureEnvironment(projectUuid, input.environment);

      let privateKeyUuid = target.privateKeyUuid;
      let publicKeyOpenSSH: string | null = null;

      if (isPrivate) {
        if (!privateKeyUuid) {
          const keyName = `praxarch-${input.tenantId}-${input.serviceId}`;
          const pair = generateDeployKeyPair(keyName);
          publicKeyOpenSSH = pair.publicKeyOpenSSH;
          const created = await this.coolify.createSecurityKey({
            name: keyName,
            description: `Deploy key for ${input.tenantId}/${input.serviceId}`,
            privateKey: pair.privateKeyOpenSSH,
          });
          privateKeyUuid = created.uuid;
          target = await this.deployTargets.setCoolifyIds(
            input.tenantId,
            input.serviceId,
            input.environment,
            { privateKeyUuid, coolifyProjectUuid: projectUuid, coolifyServerUuid: serverUuid }
          );

          const token =
            input.githubToken ?? (await this.secrets.get(input.tenantId, "github.provisioning"));
          if (!token) {
            throw new HttpException(
              "githubToken is required to provision a private repository",
              HttpStatus.BAD_REQUEST
            );
          }
          await this.github.addDeployKey({
            repo: input.repo,
            publicKey: publicKeyOpenSSH,
            token,
            title: `praxarch-${input.tenantId}-${input.serviceId}`,
          });
        }
      }

      if (target.coolifyAppUuid) {
        target = await this.deployTargets.setCoolifyIds(
          input.tenantId,
          input.serviceId,
          input.environment,
          { status: "ready" }
        );
        return { target, coolifyAppUuid: target.coolifyAppUuid!, resumed: true };
      }

      const gitRepository = isPrivate
        ? this.github.toSshUrl(input.repo)
        : this.normalizeHttpsRepo(input.repo);
      const appName =
        input.appName ?? `${input.tenantId}-${input.serviceId}-${input.environment}`;

      const baseBody = {
        project_uuid: projectUuid,
        server_uuid: serverUuid,
        environment_name: input.environment,
        environment_uuid: environmentUuid,
        git_repository: gitRepository,
        git_branch: branch,
        build_pack: buildPack,
        ports_exposes: portsExposes,
        name: appName,
        description: `Provisioned by Praxarch for ${input.tenantId}/${input.serviceId}`,
        ...(buildPack === "dockercompose"
          ? { docker_compose_location: "/docker-compose.yml" }
          : {}),
      };

      const created = isPrivate
        ? await this.coolify.createPrivateDeployKeyApplication({
            ...baseBody,
            private_key_uuid: privateKeyUuid,
          })
        : await this.coolify.createPublicApplication(baseBody);

      target = await this.deployTargets.setCoolifyIds(
        input.tenantId,
        input.serviceId,
        input.environment,
        {
          coolifyServerUuid: serverUuid,
          coolifyProjectUuid: projectUuid,
          coolifyAppUuid: created.uuid,
          coolifyEnvUuid: environmentUuid,
          privateKeyUuid: privateKeyUuid ?? undefined,
          status: "ready",
        }
      );

      this.logger.log(
        `Provisioned ${input.tenantId}/${input.serviceId}/${input.environment} → Coolify app ${created.uuid}`
      );

      return { target, coolifyAppUuid: created.uuid, resumed: false };
    } catch (err) {
      const message = err instanceof HttpException ? err.message : (err as Error).message;
      await this.deployTargets.setStatus(
        input.tenantId,
        input.serviceId,
        input.environment,
        "error",
        message
      );
      throw err;
    }
  }

  private async ensureProject(name: string, tenantId: string): Promise<string> {
    const projects = await this.coolify.listProjects();
    const existing = projects.find((p) => p.name === name);
    if (existing) return existing.uuid;
    const created = await this.coolify.createProject(name, `Praxarch tenant ${tenantId}`);
    return created.uuid;
  }

  private async ensureEnvironment(
    projectUuid: string,
    environment: "staging" | "production"
  ): Promise<string> {
    const envs = await this.coolify.listEnvironments(projectUuid);
    const existing = envs.find((e) => e.name === environment);
    if (existing) return existing.uuid;
    const created = await this.coolify.createEnvironment(projectUuid, environment);
    return created.uuid;
  }

  private normalizeHttpsRepo(repo: string): string {
    const trimmed = repo.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    const { owner, name } = this.github.parseRepo(repo);
    return `https://github.com/${owner}/${name}`;
  }
}
