import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { normalizeSshPrivateKey, sshPrivateKeysMatch } from "./ssh-key.util";

export interface CoolifyServer {
  uuid: string;
  name: string;
  ip?: string;
  is_usable?: boolean;
  is_reachable?: boolean;
}

export interface CoolifyProject {
  uuid: string;
  name: string;
}

export interface CoolifyEnvironment {
  uuid: string;
  name: string;
}

export interface CoolifySecurityKey {
  id?: number;
  uuid: string;
  name: string;
  public_key?: string;
  fingerprint?: string;
  private_key?: string;
  is_git_related?: boolean;
}

@Injectable()
export class CoolifyApiClient {
  private readonly logger = new Logger(CoolifyApiClient.name);
  private cachedServerUuid: string | null = null;

  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string {
    const url = this.config.get<string>("COOLIFY_API_URL");
    if (!url) {
      throw new HttpException("COOLIFY_API_URL is not configured", HttpStatus.BAD_GATEWAY);
    }
    return url.replace(/\/$/, "");
  }

  private token(): string {
    const token = this.config.get<string>("COOLIFY_API_TOKEN");
    if (!token) {
      throw new HttpException("COOLIFY_API_TOKEN is not configured", HttpStatus.BAD_GATEWAY);
    }
    return token;
  }

  async request<T>(
    path: string,
    init?: RequestInit & { json?: unknown; timeoutMs?: number }
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token()}`,
      ...(init?.json ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    };
    const timeoutMs = init?.timeoutMs ?? 30_000;
    const { timeoutMs: _t, json, ...rest } = init ?? {};
    const res = await fetch(`${this.baseUrl()}${path}`, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      this.logger.error(`Coolify ${init?.method ?? "GET"} ${path} → ${res.status}: ${text}`);
      throw new HttpException(
        { message: "Coolify API request failed", path, upstreamStatus: res.status, detail: text },
        HttpStatus.BAD_GATEWAY
      );
    }
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  async listServers(): Promise<CoolifyServer[]> {
    return this.request<CoolifyServer[]>("/api/v1/servers");
  }

  async getServer(
    uuid: string
  ): Promise<
    CoolifyServer & {
      settings?: { is_usable?: boolean; is_reachable?: boolean };
      validation_logs?: string | null;
      is_validating?: boolean;
    }
  > {
    return this.request(`/api/v1/servers/${uuid}`, { timeoutMs: 15_000 });
  }

  /** Triggers async SSH/Docker validation on the server (Coolify uses GET, not POST). */
  async validateServer(uuid: string): Promise<unknown> {
    return this.request(`/api/v1/servers/${uuid}/validate`, { method: "GET", timeoutMs: 30_000 });
  }

  async getServerPrivateKeyMaterial(serverUuid: string): Promise<string | null> {
    const server = await this.getServer(serverUuid);
    const keyId = (server as { private_key_id?: number }).private_key_id;
    if (keyId == null) return null;
    const keys = await this.listSecurityKeys();
    const match = keys.find((k) => k.id === keyId);
    return match?.private_key ?? null;
  }

  async listApplicationEnvs(appUuid: string): Promise<{ uuid: string; key: string; value?: string }[]> {
    return this.request(`/api/v1/applications/${appUuid}/envs`);
  }

  async createApplicationEnv(
    appUuid: string,
    input: { key: string; value: string }
  ): Promise<{ uuid: string }> {
    return this.request<{ uuid: string }>(`/api/v1/applications/${appUuid}/envs`, {
      method: "POST",
      json: {
        key: input.key,
        value: input.value,
        is_preview: false,
        is_literal: true,
        is_multiline: false,
        is_shown_once: false,
      },
    });
  }

  async updateApplicationEnv(
    appUuid: string,
    key: string,
    value: string
  ): Promise<unknown> {
    return this.request(`/api/v1/applications/${appUuid}/envs`, {
      method: "PATCH",
      json: { key, value, is_literal: true, is_preview: false },
    });
  }

  /** Resolve a Coolify server — prefers an explicit UUID (wizard / EC2 target). */
  async resolveServerUuid(preferredUuid?: string): Promise<string> {
    const servers = await this.listServers();
    if (preferredUuid) {
      const match = servers.find((s) => s.uuid === preferredUuid);
      if (!match) {
        throw new HttpException(
          `Coolify server ${preferredUuid} not found`,
          HttpStatus.BAD_GATEWAY
        );
      }
      if (match.is_usable === false) {
        throw new HttpException(
          `Coolify server "${match.name}" is not usable`,
          HttpStatus.BAD_GATEWAY
        );
      }
      return match.uuid;
    }
    if (this.cachedServerUuid) return this.cachedServerUuid;
    const usable =
      servers.find((s) => s.is_usable && s.is_reachable) ??
      servers.find((s) => s.is_usable) ??
      servers[0];
    if (!usable?.uuid) {
      throw new HttpException("No usable Coolify server found", HttpStatus.BAD_GATEWAY);
    }
    this.cachedServerUuid = usable.uuid;
    return usable.uuid;
  }

  async listProjects(): Promise<CoolifyProject[]> {
    return this.request<CoolifyProject[]>("/api/v1/projects");
  }

  async createProject(name: string, description?: string): Promise<CoolifyProject> {
    return this.request<CoolifyProject>("/api/v1/projects", {
      method: "POST",
      json: { name, description },
    });
  }

  async listEnvironments(projectUuid: string): Promise<CoolifyEnvironment[]> {
    return this.request<CoolifyEnvironment[]>(`/api/v1/projects/${projectUuid}/environments`);
  }

  async createEnvironment(projectUuid: string, name: string): Promise<CoolifyEnvironment> {
    return this.request<CoolifyEnvironment>(`/api/v1/projects/${projectUuid}/environments`, {
      method: "POST",
      json: { name },
    });
  }

  async listSecurityKeys(): Promise<CoolifySecurityKey[]> {
    return this.request<CoolifySecurityKey[]>("/api/v1/security/keys");
  }

  /** Find an existing server SSH key with the same private key material. */
  async findServerSshKeyByMaterial(privateKey: string): Promise<CoolifySecurityKey | undefined> {
    const normalized = normalizeSshPrivateKey(privateKey);
    const keys = await this.listSecurityKeys();
    return keys.find(
      (k) => !k.is_git_related && k.private_key && sshPrivateKeysMatch(k.private_key, normalized)
    );
  }

  /**
   * Register an SSH key with Coolify or reuse an existing one when the same
   * private key is already stored (common for staging + production EC2).
   */
  async ensureServerSshKey(input: {
    name: string;
    description: string;
    privateKey: string;
  }): Promise<CoolifySecurityKey> {
    const existing = await this.findServerSshKeyByMaterial(input.privateKey);
    if (existing) {
      this.logger.log(`Reusing Coolify SSH key ${existing.uuid} (${existing.name})`);
      return existing;
    }

    try {
      return await this.createServerSshKey(input);
    } catch (e) {
      if (this.isDuplicatePrivateKeyError(e)) {
        const retry = await this.findServerSshKeyByMaterial(input.privateKey);
        if (retry) {
          this.logger.log(`Reusing Coolify SSH key ${retry.uuid} after duplicate response`);
          return retry;
        }
      }
      throw e;
    }
  }

  private isDuplicatePrivateKeyError(e: unknown): boolean {
    if (!(e instanceof HttpException)) return false;
    const body = e.getResponse();
    if (typeof body !== "object" || body === null) return false;
    const detail = String((body as { detail?: string }).detail ?? "");
    return detail.includes("Private key already exists");
  }

  async createSecurityKey(input: {
    name: string;
    description: string;
    privateKey: string;
  }): Promise<CoolifySecurityKey> {
    return this.request<CoolifySecurityKey>("/api/v1/security/keys", {
      method: "POST",
      json: {
        name: input.name,
        description: input.description,
        private_key: input.privateKey,
        is_git_related: true,
      },
    });
  }

  /** SSH key for server access (not git deploy keys). */
  async createServerSshKey(input: {
    name: string;
    description: string;
    privateKey: string;
  }): Promise<CoolifySecurityKey> {
    return this.request<CoolifySecurityKey>("/api/v1/security/keys", {
      method: "POST",
      json: {
        name: input.name,
        description: input.description,
        private_key: input.privateKey,
        is_git_related: false,
      },
    });
  }

  async createServer(input: {
    name: string;
    description?: string;
    ip: string;
    port: number;
    user: string;
    privateKeyUuid: string;
    instantValidate?: boolean;
    proxyType?: string;
  }): Promise<{ uuid: string }> {
    return this.request<{ uuid: string }>("/api/v1/servers", {
      method: "POST",
      json: {
        name: input.name,
        description: input.description,
        ip: input.ip,
        port: input.port,
        user: input.user,
        private_key_uuid: input.privateKeyUuid,
        is_build_server: false,
        instant_validate: input.instantValidate ?? true,
        proxy_type: input.proxyType ?? "traefik",
      },
    });
  }

  async updateServer(
    uuid: string,
    input: Partial<{
      name: string;
      description: string;
      ip: string;
      port: number;
      user: string;
      privateKeyUuid: string;
      proxyType: "traefik" | "caddy" | "none";
    }>
  ): Promise<unknown> {
    return this.request(`/api/v1/servers/${uuid}`, {
      method: "PATCH",
      json: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.ip !== undefined ? { ip: input.ip } : {}),
        ...(input.port !== undefined ? { port: input.port } : {}),
        ...(input.user !== undefined ? { user: input.user } : {}),
        ...(input.privateKeyUuid !== undefined ? { private_key_uuid: input.privateKeyUuid } : {}),
        ...(input.proxyType !== undefined ? { proxy_type: input.proxyType } : {}),
      },
    });
  }

  findServerByHost(servers: CoolifyServer[], host: string): CoolifyServer | undefined {
    const ip = host.trim();
    return servers.find((s) => s.ip === ip);
  }

  async createPublicApplication(body: Record<string, unknown>): Promise<{ uuid: string }> {
    return this.request<{ uuid: string }>("/api/v1/applications/public", {
      method: "POST",
      json: body,
    });
  }

  async createPrivateDeployKeyApplication(body: Record<string, unknown>): Promise<{ uuid: string }> {
    return this.request<{ uuid: string }>("/api/v1/applications/private-deploy-key", {
      method: "POST",
      json: body,
    });
  }

  async updateApplication(
    uuid: string,
    input: { git_branch?: string; git_repository?: string; docker_compose_location?: string }
  ): Promise<unknown> {
    return this.request(`/api/v1/applications/${uuid}`, {
      method: "PATCH",
      json: {
        ...(input.git_branch !== undefined ? { git_branch: input.git_branch } : {}),
        ...(input.git_repository !== undefined ? { git_repository: input.git_repository } : {}),
        ...(input.docker_compose_location !== undefined
          ? { docker_compose_location: input.docker_compose_location }
          : {}),
        is_preserve_repository_enabled: true,
      },
    });
  }
}
