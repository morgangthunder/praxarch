import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { execFile } from "child_process";
import { access } from "fs/promises";
import { promisify } from "util";
import { CoolifyApiClient } from "./coolify-api.client";
import { CoolifyServersService } from "./coolify-servers.service";
import { resolveProfileOptions } from "./compose-build-profiles";
import { DeployTargetsService } from "./deploy-targets.service";
import { runSshCommand } from "./remote-ssh.util";
import { GitHubService } from "../common/secrets/github.service";
import { SecretsService } from "../common/secrets/secrets.service";
import type { DeployTargetRecord } from "./deploy-targets.types";

const execFileAsync = promisify(execFile);

export interface EcrReleaseResult {
  commitSha: string;
  imageRef: string;
  built: boolean;
  githubUpdated: boolean;
}

@Injectable()
export class EcrReleaseService {
  private readonly logger = new Logger(EcrReleaseService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly deployTargets: DeployTargetsService,
    private readonly coolify: CoolifyApiClient,
    private readonly servers: CoolifyServersService,
    private readonly github: GitHubService,
    private readonly secrets: SecretsService
  ) {}

  needsEcrRelease(target: DeployTargetRecord | null, environment: string): boolean {
    if (environment !== "production" || !target) return false;
    return Boolean(resolveProfileOptions(target.deployProfileOptions).ecrRepository?.trim());
  }

  /** Build (optional) → push ECR → update GitHub compose image pin. */
  async prepareProductionRelease(
    tenantId: string,
    serviceId: string,
    target: DeployTargetRecord
  ): Promise<EcrReleaseResult> {
    const opts = resolveProfileOptions(target.deployProfileOptions);
    const ecrRepository = opts.ecrRepository!.replace(/\/$/, "");
    const ecrRegion = opts.ecrRegion?.trim() || "eu-west-1";
    const ecrImageTag = opts.ecrImageTag?.trim() || "v2";
    const branch = target.branch || "master";

    let token: string | null;
    try {
      token = await this.secrets.get(tenantId, "github.provisioning");
    } catch {
      token = null;
    }
    if (!token?.trim()) {
      throw new HttpException(
        "GitHub token missing — add github.provisioning to tenant secrets (used to update docker-compose.yml).",
        HttpStatus.BAD_REQUEST
      );
    }
    const commitSha = await this.github.getBranchCommitSha(target.repo, branch, token);
    const shortSha = commitSha.slice(0, 7);
    const imageRef = `${ecrRepository}:${ecrImageTag}`;

    let built = false;
    if (!opts.ecrSkipBuild) {
      const skip = await this.ecrImageExists(ecrRepository, shortSha, ecrRegion, opts.ecrBuildServerUuid, tenantId);
      if (skip) {
        this.logger.log(`ECR image ${ecrRepository}:${shortSha} already exists — skipping build`);
      } else if (opts.ecrBuildServerUuid) {
        // Hosted / cloud path: build server git-pulls from GitHub (not a local repo mount).
        await this.buildAndPushRemote({
          serverUuid: opts.ecrBuildServerUuid,
          tenantId,
          serviceId,
          branch,
          ecrRepository,
          ecrRegion,
          ecrImageTag,
          commitShort: shortSha,
          commitSha,
        });
        built = true;
      } else if (await this.canBuildLocally()) {
        // Local dev convenience when Bubblbook repo + Docker socket are mounted into the API container.
        await this.buildAndPushLocal({
          ecrRepository,
          ecrRegion,
          ecrImageTag,
          commitShort: shortSha,
          commitSha,
        });
        built = true;
      } else {
        throw new HttpException(
          {
            message:
              "ECR build not configured. Set ecrBuildServerUuid (build server git-pulls from GitHub) or mount BUBBLBOOK_REPO_HOST_PATH for local dev, or ecrSkipBuild for redeploy-only.",
          },
          HttpStatus.BAD_REQUEST
        );
      }
    }

    const gh = await this.github.updateComposeImagePin({
      repo: target.repo,
      branch,
      token,
      imageRef,
      commitMessage: `chore(deploy): pin ${imageRef} (${shortSha}) via Praxarch`,
    });

    return {
      commitSha,
      imageRef,
      built,
      githubUpdated: gh.changed,
    };
  }

  private async canBuildLocally(): Promise<boolean> {
    const mount = this.config.get<string>("BUBBLBOOK_REPO_MOUNT") ?? "/bubblbook-src";
    try {
      await access(`${mount}/Dockerfile`);
      await execFileAsync("docker", ["version"], { timeout: 10_000 });
      await execFileAsync("aws", ["--version"], { timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }

  private async buildAndPushLocal(input: {
    ecrRepository: string;
    ecrRegion: string;
    ecrImageTag: string;
    commitShort: string;
    commitSha: string;
  }): Promise<void> {
    const mount = this.config.get<string>("BUBBLBOOK_REPO_MOUNT") ?? "/bubblbook-src";
    const localTag = `praxarch-ecr-build:${input.ecrImageTag}`;
    this.logger.log(`Local ECR build from ${mount} → ${input.ecrRepository}:${input.ecrImageTag}`);

    await execFileAsync(
      "docker",
      [
        "build",
        "--build-arg",
        `BUILD_COMMIT=${input.commitSha}`,
        "-t",
        localTag,
        "-f",
        "Dockerfile",
        mount,
      ],
      { timeout: 45 * 60_000, maxBuffer: 16 * 1024 * 1024 }
    );

    const registryHost = input.ecrRepository.split("/")[0];
    await execFileAsync(
      "docker",
      ["tag", localTag, `${input.ecrRepository}:${input.ecrImageTag}`],
      { timeout: 60_000 }
    );
    await execFileAsync(
      "docker",
      ["tag", localTag, `${input.ecrRepository}:${input.commitShort}`],
      { timeout: 60_000 }
    );

    const { stdout: password } = await execFileAsync(
      "aws",
      ["ecr", "get-login-password", "--region", input.ecrRegion],
      { timeout: 60_000 }
    );
    await execFileAsync(
      "sh",
      [
        "-c",
        `echo ${JSON.stringify(password.trim())} | docker login --username AWS --password-stdin ${registryHost}`,
      ],
      { timeout: 60_000 }
    );

    await execFileAsync("docker", ["push", `${input.ecrRepository}:${input.ecrImageTag}`], {
      timeout: 20 * 60_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    await execFileAsync("docker", ["push", `${input.ecrRepository}:${input.commitShort}`], {
      timeout: 20 * 60_000,
      maxBuffer: 8 * 1024 * 1024,
    });
  }

  private async buildAndPushRemote(input: {
    serverUuid: string;
    tenantId: string;
    serviceId: string;
    branch: string;
    ecrRepository: string;
    ecrRegion: string;
    ecrImageTag: string;
    commitShort: string;
    commitSha: string;
  }): Promise<void> {
    const stagingTarget = await this.deployTargets.get(input.tenantId, input.serviceId, "staging");
    const composeDir =
      stagingTarget?.coolifyAppUuid != null
        ? `/data/coolify/applications/${stagingTarget.coolifyAppUuid}`
        : `/data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3`;

    const { host, port, user, privateKey } = await this.sshTarget(input.serverUuid, input.tenantId);
    const localTag = `bubblbook-ecr-build:${input.ecrImageTag}`;
    const script = [
      "#!/bin/bash",
      "set -e",
      `cd "${composeDir}"`,
      "sudo docker builder prune -af 2>&1 | tail -2 || true",
      "sudo docker image prune -f 2>&1 | tail -2 || true",
      `git fetch origin && git checkout "${input.branch}" && git pull --ff-only origin "${input.branch}"`,
      "export DOCKER_BUILDKIT=1",
      `sudo -E docker build --build-arg BUILD_COMMIT=${input.commitSha} -t ${localTag} -f Dockerfile .`,
      `aws ecr get-login-password --region ${input.ecrRegion} | sudo docker login --username AWS --password-stdin ${input.ecrRepository.split("/")[0]}`,
      `sudo docker tag ${localTag} ${input.ecrRepository}:${input.ecrImageTag}`,
      `sudo docker tag ${localTag} ${input.ecrRepository}:${input.commitShort}`,
      `sudo docker push ${input.ecrRepository}:${input.ecrImageTag}`,
      `sudo docker push ${input.ecrRepository}:${input.commitShort}`,
      "echo REMOTE_ECR_OK",
    ].join("\n");

    const result = await runSshCommand({
      host,
      port,
      user,
      privateKey,
      command: script,
      timeoutMs: 50 * 60_000,
    });
    if (!result.stdout.includes("REMOTE_ECR_OK") && !result.stderr.includes("REMOTE_ECR_OK")) {
      throw new HttpException(
        { message: "Remote ECR build/push failed", detail: (result.stdout + result.stderr).slice(-500) },
        HttpStatus.BAD_GATEWAY
      );
    }
  }

  private async ecrImageExists(
    repository: string,
    tag: string,
    region: string,
    buildServerUuid: string | undefined,
    tenantId: string
  ): Promise<boolean> {
    const repoName = repository.split("/").slice(1).join("/");
    const cmd = `aws ecr describe-images --repository-name ${repoName} --image-ids imageTag=${tag} --region ${region} >/dev/null 2>&1 && echo yes || echo no`;
    try {
      if (await this.canBuildLocally()) {
        const { stdout } = await execFileAsync("sh", ["-c", cmd], { timeout: 30_000 });
        return stdout.trim() === "yes";
      }
      if (buildServerUuid) {
        const { host, port, user, privateKey } = await this.sshTarget(buildServerUuid, tenantId);
        const result = await runSshCommand({ host, port, user, privateKey, command: cmd, timeoutMs: 60_000 });
        return (result.stdout || result.stderr).trim().endsWith("yes");
      }
    } catch {
      return false;
    }
    return false;
  }

  private async sshTarget(uuid: string, tenantId: string) {
    const raw = await this.coolify.getServer(uuid);
    if (!this.servers.isVisibleToTenant(raw, tenantId)) {
      throw new NotFoundException("Server not found for this tenant");
    }
    const privateKey = await this.coolify.getServerPrivateKeyMaterial(uuid);
    if (!privateKey) throw new NotFoundException("SSH key not available for server");
    return {
      host: raw.ip ?? "",
      port: (raw as { port?: number }).port ?? 22,
      user: (raw as { user?: string }).user ?? "root",
      privateKey,
    };
  }
}
