import { Injectable, Logger, NotFoundException } from "@nestjs/common";

import { CoolifyServersService } from "./coolify-servers.service";

import { DeployTargetsService } from "./deploy-targets.service";

import { CoolifyApiClient } from "./coolify-api.client";

import { CoolifyEnvService } from "./coolify-env.service";

import { runSshCommand } from "./remote-ssh.util";

import {

  buildComposeAuditCommand,

  parseComposeAuditOutput,

  type ComposeImageAudit,

} from "./compose-audit.util";

import { composeMcpOnlyCommand } from "./compose-build.util";

import {

  buildRemoteSourceDeployScript,

  isSourceBuildProfile,

  normalizeDeployProfile,

  resolveProfileOptions,

} from "./compose-build-profiles";



export interface BuildFromSourceResult {

  serviceId: string;

  environment: "staging" | "production";

  composeDir: string;

  includeMcp: boolean;

  async: boolean;

  logPath: string;

  donePath: string;

  deployProfile: string;

  buildLogTail?: string;

  auditAfter?: ComposeImageAudit;

}



export interface SourceDeployHandle {

  deploymentId: string;

  logPath: string;

  donePath: string;

  serverUuid: string;

  composeDir: string;

}



@Injectable()

export class DeploymentComposeService {

  private readonly logger = new Logger(DeploymentComposeService.name);



  constructor(

    private readonly deployTargets: DeployTargetsService,

    private readonly coolify: CoolifyApiClient,

    private readonly servers: CoolifyServersService,

    private readonly coolifyEnv: CoolifyEnvService

  ) {}



  coolifyApplicationDir(appUuid: string): string {

    return `/data/coolify/applications/${appUuid}`;

  }



  async auditImage(

    tenantId: string,

    serviceId: string,

    environment: "staging" | "production"

  ): Promise<ComposeImageAudit | null> {

    const target = await this.deployTargets.get(tenantId, serviceId, environment);

    if (!target?.coolifyServerUuid || !target.coolifyAppUuid) return null;



    const composeDir = this.coolifyApplicationDir(target.coolifyAppUuid);

    const { host, port, user, privateKey } = await this.sshTarget(

      target.coolifyServerUuid,

      tenantId

    );

    if (!host || !privateKey) return null;



    const cmd = buildComposeAuditCommand(composeDir, target.coolifyAppUuid);

    const result = await runSshCommand({

      host,

      port,

      user,

      privateKey,

      command: cmd,

      timeoutMs: 60_000,

    });

    return parseComposeAuditOutput(result.stdout || result.stderr, composeDir);

  }



  async startSourceDeploy(

    tenantId: string,

    serviceId: string,

    environment: "staging" | "production",

    options: { branch: string; deploymentId: string }

  ): Promise<SourceDeployHandle> {

    const target = await this.deployTargets.get(tenantId, serviceId, environment);

    if (!target?.coolifyServerUuid || !target.coolifyAppUuid) {

      throw new NotFoundException(`No Coolify app for ${serviceId}/${environment}`);

    }



    const profile = normalizeDeployProfile(target.deployProfile);

    if (!isSourceBuildProfile(profile)) {

      throw new NotFoundException(`Environment ${serviceId}/${environment} is not a source-build profile`);

    }



    const profileOpts = resolveProfileOptions(target.deployProfileOptions);

    const includeMcp = profileOpts.includeMcpOverlay;

    const composeDir = this.coolifyApplicationDir(target.coolifyAppUuid);

    const logPath = `/tmp/praxarch-build-${options.deploymentId}.log`;

    const donePath = `/tmp/praxarch-build-${options.deploymentId}.done`;

    const envs = await this.coolifyEnv.getVaultForDeploy(tenantId, serviceId, environment);

    const envFileB64 = Buffer.from(this.coolifyEnv.formatEnvFile(envs)).toString("base64");

    const appPort = envs.PORT?.trim() || target.portsExposes || "3300";



    const buildScript = buildRemoteSourceDeployScript({

      composeDir,

      profile,

      branch: options.branch,

      includeMcp,

      envFilePath: profileOpts.envFilePath,

      envFileB64,

      minDiskMb: profileOpts.minDiskMb,

      donePath,

      appPort,

    });



    const { host, port, user, privateKey } = await this.sshTarget(

      target.coolifyServerUuid,

      tenantId

    );



    const scriptB64 = Buffer.from(buildScript).toString("base64");

    const startCmd = [

      `echo '${scriptB64}' | base64 -d > /tmp/praxarch-deploy-${options.deploymentId}.sh`,

      `chmod +x /tmp/praxarch-deploy-${options.deploymentId}.sh`,

      `rm -f ${donePath} ${logPath}`,

      `nohup /tmp/praxarch-deploy-${options.deploymentId}.sh > ${logPath} 2>&1 </dev/null & disown`,

      "sleep 1",

      "echo started",

    ].join("; ");



    this.logger.log(

      `startSourceDeploy ${profile} ${tenantId}/${serviceId}/${environment} branch=${options.branch} on ${host}`

    );

    await runSshCommand({

      host,

      port,

      user,

      privateKey,

      command: startCmd,

      timeoutMs: 60_000,

    });



    return {

      deploymentId: options.deploymentId,

      logPath,

      donePath,

      serverUuid: target.coolifyServerUuid,

      composeDir,

    };

  }



  async pollSourceDeploy(

    handle: SourceDeployHandle,

    tenantId: string

  ): Promise<{ status: "building" | "success" | "failed"; commitSha?: string; errorMessage?: string }> {

    const { host, port, user, privateKey } = await this.sshTarget(handle.serverUuid, tenantId);

    const cmd = [

      `if [ -f "${handle.donePath}" ]; then cat "${handle.donePath}"; echo " @@DONE@@"; fi`,

      `tail -30 "${handle.logPath}" 2>/dev/null || true`,

    ].join("; ");

    const result = await runSshCommand({

      host,

      port,

      user,

      privateKey,

      command: cmd,

      timeoutMs: 30_000,

    });

    const out = (result.stdout || "") + (result.stderr || "");

    if (out.includes("@@DONE@@")) {

      const commitSha = out.split("@@DONE@@")[0].trim().split("\n").pop()?.trim();

      return { status: "success", commitSha: commitSha && commitSha.length >= 7 ? commitSha.slice(0, 40) : undefined };

    }

    if (/DISK_LOW:|HEALTH_FAIL|error:/i.test(out)) {

      const tail = out.split("\n").slice(-5).join(" ").slice(0, 240);

      return { status: "failed", errorMessage: tail || "Source deploy failed on host" };

    }

    return { status: "building" };

  }



  async buildFromSource(

    tenantId: string,

    serviceId: string,

    environment: "staging" | "production",

    options: { includeMcp?: boolean; waitForCompletion?: boolean } = {}

  ): Promise<BuildFromSourceResult> {

    const target = await this.deployTargets.get(tenantId, serviceId, environment);

    if (!target?.coolifyServerUuid || !target.coolifyAppUuid) {

      throw new NotFoundException(`No Coolify app for ${serviceId}/${environment}`);

    }



    const deploymentId = `manual-${Date.now()}`;

    const handle = await this.startSourceDeploy(tenantId, serviceId, environment, {

      branch: target.branch,

      deploymentId,

    });



    if (options.waitForCompletion) {

      const deadline = Date.now() + 1_800_000;

      while (Date.now() < deadline) {

        const poll = await this.pollSourceDeploy(handle, tenantId);

        if (poll.status === "success") {

          const auditAfter = (await this.auditImage(tenantId, serviceId, environment))!;

          return {

            serviceId,

            environment,

            composeDir: handle.composeDir,

            includeMcp: options.includeMcp !== false,

            async: false,

            logPath: handle.logPath,

            donePath: handle.donePath,

            deployProfile: target.deployProfile,

            auditAfter,

          };

        }

        if (poll.status === "failed") {

          throw new NotFoundException(poll.errorMessage ?? "Build failed");

        }

        await new Promise((r) => setTimeout(r, 5000));

      }

      throw new NotFoundException("Timed out waiting for source build");

    }



    return {

      serviceId,

      environment,

      composeDir: handle.composeDir,

      includeMcp: options.includeMcp !== false,

      async: true,

      logPath: handle.logPath,

      donePath: handle.donePath,

      deployProfile: target.deployProfile,

    };

  }



  async ensureMcpOverlay(

    tenantId: string,

    serviceId: string,

    environment: "staging" | "production"

  ): Promise<{ started: boolean; logTail: string }> {

    const target = await this.deployTargets.get(tenantId, serviceId, environment);

    if (!target?.coolifyServerUuid || !target.coolifyAppUuid) {

      throw new NotFoundException(`No Coolify app for ${serviceId}/${environment}`);

    }

    const composeDir = this.coolifyApplicationDir(target.coolifyAppUuid);

    const { host, port, user, privateKey } = await this.sshTarget(

      target.coolifyServerUuid,

      tenantId

    );

    const result = await runSshCommand({

      host,

      port,

      user,

      privateKey,

      command: composeMcpOnlyCommand(composeDir),

      timeoutMs: 600_000,

    });

    return { started: true, logTail: (result.stdout || result.stderr).slice(-2000) };

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


