import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { CoolifyApiClient } from "./coolify-api.client";
import { DeployTargetsService } from "./deploy-targets.service";
import { SecretsService } from "../common/secrets/secrets.service";
import { parseEnvText } from "./parse-env-vars";

@Injectable()
export class CoolifyEnvService {
  private readonly logger = new Logger(CoolifyEnvService.name);

  constructor(
    private readonly coolify: CoolifyApiClient,
    private readonly secrets: SecretsService,
    private readonly deployTargets: DeployTargetsService
  ) {}

  vaultKey(serviceId: string, environment: "staging" | "production"): string {
    return `deploy.env.${serviceId}.${environment}`;
  }

  async getVault(
    tenantId: string,
    serviceId: string,
    environment: "staging" | "production"
  ): Promise<Record<string, string>> {
    const raw = await this.secrets.get(tenantId, this.vaultKey(serviceId, environment));
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }

  envToText(envs: Record<string, string>): string {
    return Object.entries(envs)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
  }

  /** Persist env vars in tenant vault (encrypted) — source of truth for re-sync. */
  async storeVault(
    tenantId: string,
    serviceId: string,
    environment: "staging" | "production",
    envs: Record<string, string>
  ): Promise<void> {
    await this.secrets.put(tenantId, this.vaultKey(serviceId, environment), JSON.stringify(envs));
  }

  /** Upsert env vars in vault from `.env`-style text. */
  async setFromText(
    tenantId: string,
    serviceId: string,
    environment: "staging" | "production",
    envText: string,
    merge: boolean
  ): Promise<Record<string, string>> {
    const incoming = parseEnvText(envText);
    const merged = merge ? { ...(await this.getVault(tenantId, serviceId, environment)), ...incoming } : incoming;
    await this.storeVault(tenantId, serviceId, environment, merged);
    return merged;
  }

  /** Push env vars to Coolify — updates by key, creates missing ones. */
  async syncToApplication(appUuid: string, envs: Record<string, string>): Promise<number> {
    if (!Object.keys(envs).length) return 0;
    const existing = await this.coolify.listApplicationEnvs(appUuid).catch(() => []);
    const existingKeys = new Set(existing.map((e) => e.key));
    let count = 0;
    for (const [key, value] of Object.entries(envs)) {
      const trimmedKey = key.trim();
      if (!trimmedKey) continue;
      if (existingKeys.has(trimmedKey)) {
        await this.coolify.updateApplicationEnv(appUuid, trimmedKey, value);
      } else {
        await this.coolify.createApplicationEnv(appUuid, { key: trimmedKey, value });
        existingKeys.add(trimmedKey);
      }
      count++;
    }
    if (count) this.logger.log(`Synced ${count} env var(s) to Coolify app ${appUuid}`);
    return count;
  }

  /** Push vault → Coolify for a provisioned service/environment. */
  async syncServiceEnvironment(
    tenantId: string,
    serviceId: string,
    environment: "staging" | "production"
  ): Promise<{ synced: number; appUuid: string }> {
    const target = await this.deployTargets.get(tenantId, serviceId, environment);
    if (!target?.coolifyAppUuid) {
      throw new NotFoundException(`No Coolify app for ${serviceId}/${environment}`);
    }
    const envs = this.withDerivedSpaUrl(await this.getVault(tenantId, serviceId, environment));
    const synced = await this.syncToApplication(target.coolifyAppUuid, envs);
    return { synced, appUuid: target.coolifyAppUuid };
  }

  /** MCP join links use BUBBLBOOK_SPA_URL — derive from baseURL/baseURLApi when unset. */
  withDerivedSpaUrl(envs: Record<string, string>): Record<string, string> {
    if (envs.BUBBLBOOK_SPA_URL?.trim()) return envs;
    const fromApi = envs.baseURLApi?.trim().replace(/\/$/, "");
    if (fromApi) return { ...envs, BUBBLBOOK_SPA_URL: fromApi };
    const fromBase = envs.baseURL?.trim().replace(/\/$/, "").replace(/\/app$/i, "");
    if (fromBase) return { ...envs, BUBBLBOOK_SPA_URL: fromBase };
    return envs;
  }

  /** `.env`-style text for compose env_file on the Coolify host. */
  formatEnvFile(envs: Record<string, string>): string {
    return Object.entries(envs)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
  }

  async getVaultForDeploy(
    tenantId: string,
    serviceId: string,
    environment: "staging" | "production"
  ): Promise<Record<string, string>> {
    return this.withDerivedSpaUrl(await this.getVault(tenantId, serviceId, environment));
  }
}
