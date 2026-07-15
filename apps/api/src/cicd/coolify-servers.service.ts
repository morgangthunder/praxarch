import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { CoolifyApiClient, type CoolifyServer } from "./coolify-api.client";
import type { CreateCoolifyServerDto } from "./dto/create-coolify-server.dto";
import { assertValidSshPrivateKey, coolifyErrorMessage } from "./ssh-key.util";
export interface CoolifyServerView {
  uuid: string;
  name: string;
  host: string | null;
  usable: boolean;
  reachable: boolean;
  platform: boolean;
  validated?: boolean;
  validationMessage?: string;
}

function serverFlags(
  server: CoolifyServer & {
    settings?: { is_usable?: boolean; is_reachable?: boolean };
    is_validating?: boolean;
    validation_logs?: string | null;
  }
): {
  usable: boolean;
  reachable: boolean;
  validating: boolean;
  validationLogs: string | null;
} {
  const usable = server.is_usable ?? server.settings?.is_usable ?? false;
  const reachable = server.is_reachable ?? server.settings?.is_reachable ?? false;
  return {
    usable: usable !== false,
    reachable: reachable !== false,
    validating: server.is_validating === true,
    validationLogs: server.validation_logs ?? null,
  };
}

function validationFailureMessage(flags: ReturnType<typeof serverFlags>): string {
  if (flags.validating) {
    return "Coolify is still validating — wait a moment and click Validate again.";
  }
  if (!flags.reachable && !flags.usable) {
    return (
      "SSH connection failed — check the public IP, security group (port 22), SSH user, and that the private key matches this instance."
    );
  }
  if (flags.reachable && !flags.usable) {
    return (
      "SSH works but Docker is not installed. Install Docker manually on the server, or use Coolify → Servers → Validate and Install Docker Engine. " +
      "Praxarch will not modify live servers automatically."
    );
  }
  if (flags.validationLogs) {
    return flags.validationLogs.length > 240 ? `${flags.validationLogs.slice(0, 240)}…` : flags.validationLogs;
  }
  return "Server validation timed out — Coolify can take 2–3 minutes on first connect. Click Validate again.";
}

@Injectable()
export class CoolifyServersService {
  private readonly logger = new Logger(CoolifyServersService.name);

  constructor(private readonly coolify: CoolifyApiClient) {}

  tenantPrefix(tenantId: string): string {
    return `praxarch-${tenantId}-`;
  }

  /** Servers visible to a tenant: their own + shared platform localhost. */
  isVisibleToTenant(server: CoolifyServer, tenantId: string): boolean {
    if (server.name === "localhost") return true;
    return server.name.startsWith(this.tenantPrefix(tenantId));
  }

  displayName(server: CoolifyServer, tenantId: string): string {
    const prefix = this.tenantPrefix(tenantId);
    if (server.name.startsWith(prefix)) return server.name.slice(prefix.length);
    return server.name;
  }

  async listForTenant(tenantId: string): Promise<CoolifyServerView[]> {
    const servers = await this.coolify.listServers();
    return servers
      .filter((s) => this.isVisibleToTenant(s, tenantId))
      .map((s) => {
        const flags = serverFlags(s);
        return {
          uuid: s.uuid,
          name: this.displayName(s, tenantId),
          host: s.ip ?? null,
          usable: flags.usable,
          reachable: flags.reachable,
          platform: s.name === "localhost",
          validated: flags.usable && flags.reachable,
        };
      });
  }

  async getStatus(uuid: string, tenantId: string): Promise<CoolifyServerView> {
    const raw = await this.coolify.getServer(uuid);
    if (!this.isVisibleToTenant(raw, tenantId)) {
      throw new NotFoundException("Server not found for this tenant");
    }
    const flags = serverFlags(raw);
    return {
      uuid: raw.uuid,
      name: this.displayName(raw, tenantId),
      host: raw.ip ?? null,
      usable: flags.usable,
      reachable: flags.reachable,
      platform: raw.name === "localhost",
      validated: flags.usable && flags.reachable,
    };
  }

  /** Quick pre-deploy check: re-validate if Coolify marks the server unreachable. */
  async ensureReadyForDeploy(
    uuid: string,
    tenantId: string,
    timeoutMs = 90_000
  ): Promise<void> {
    const isReady = async (): Promise<boolean> => {
      const raw = await this.coolify.getServer(uuid);
      if (!this.isVisibleToTenant(raw, tenantId)) {
        throw new NotFoundException("Server not found for this tenant");
      }
      const flags = serverFlags(raw);
      return flags.reachable && flags.usable;
    };

    if (await isReady()) return;

    this.logger.warn(`Coolify server ${uuid} not ready — triggering validation before deploy`);
    try {
      await this.coolify.validateServer(uuid);
    } catch (err) {
      this.logger.warn(
        `Coolify validate trigger for ${uuid} returned an error — continuing to poll`,
        err instanceof Error ? err.message : err
      );
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      if (await isReady()) {
        this.logger.log(`Coolify server ${uuid} ready for deploy after validation`);
        return;
      }
    }

    throw new HttpException(
      {
        message:
          "Coolify reports the deploy server is not ready (SSH/Docker health check failed). " +
          "Wait a minute and try again, or open Coolify → Servers → Validate for the staging server.",
      },
      HttpStatus.CONFLICT
    );
  }

  /** Trigger Coolify validation and poll until reachable or timeout. Never mutates the remote host. */
  async validateAndWait(uuid: string, tenantId: string, timeoutMs = 180_000): Promise<CoolifyServerView> {
    try {
      await this.coolify.validateServer(uuid);
    } catch (e) {
      this.logger.warn(
        `Coolify validate trigger for ${uuid} returned an error — continuing to poll status`,
        e instanceof Error ? e.message : e
      );
    }

    const deadline = Date.now() + timeoutMs;
    let last: CoolifyServerView | null = null;

    while (Date.now() < deadline) {
      const raw = await this.coolify.getServer(uuid);
      if (!this.isVisibleToTenant(raw, tenantId)) {
        throw new NotFoundException("Server not found for this tenant");
      }
      const flags = serverFlags(raw);
      last = {
        uuid: raw.uuid,
        name: this.displayName(raw, tenantId),
        host: raw.ip ?? null,
        usable: flags.usable,
        reachable: flags.reachable,
        platform: raw.name === "localhost",
        validated: flags.usable && flags.reachable,
      };
      if (last.reachable && last.usable) {
        return { ...last, validated: true, validationMessage: "SSH and Docker verified" };
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    const finalStatus = last ?? (await this.getStatus(uuid, tenantId));
    const rawFinal = await this.coolify.getServer(uuid);
    const finalFlags = serverFlags(rawFinal);

    return {
      ...finalStatus,
      validated: false,
      validationMessage: validationFailureMessage(finalFlags),
    };
  }

  findLocalhost(servers: CoolifyServer[]): CoolifyServer | undefined {
    return servers.find((s) => s.name === "localhost");
  }

  /**
   * Register a remote server (EC2, VPS, etc.) with Coolify on behalf of a tenant.
   * SSH key is sent to Coolify only — never stored in Praxarch.
   */
  private rethrowCoolifyError(e: unknown, fallback: string): never {
    if (e instanceof HttpException) {
      const body = e.getResponse();
      if (typeof body === "object" && body !== null && "detail" in body) {
        const detail = String((body as { detail?: string }).detail ?? "");
        throw new HttpException(
          { message: coolifyErrorMessage(detail, fallback), detail },
          e.getStatus()
        );
      }
    }
    throw e;
  }

  private isDuplicateIpError(e: unknown): boolean {
    if (!(e instanceof HttpException)) return false;
    const body = e.getResponse();
    if (typeof body !== "object" || body === null) return false;
    const detail = String((body as { detail?: string }).detail ?? "");
    const message = String((body as { message?: string }).message ?? "");
    return (
      detail.includes("already in use") ||
      detail.includes("IP/Domain is already") ||
      message.includes("already in use")
    );
  }

  private async findByHostForTenant(tenantId: string, host: string): Promise<CoolifyServer | undefined> {
    const servers = await this.coolify.listServers();
    const match = this.coolify.findServerByHost(servers, host);
    if (!match || !this.isVisibleToTenant(match, tenantId)) return undefined;
    return match;
  }

  async register(tenantId: string, dto: CreateCoolifyServerDto): Promise<CoolifyServerView> {
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const coolifyName = `${this.tenantPrefix(tenantId)}${slug || "server"}`;
    const keyName = `${coolifyName}-ssh`;
    const sshKey = assertValidSshPrivateKey(dto.sshPrivateKey);

    const existing = await this.findByHostForTenant(tenantId, dto.host);
    if (existing) {
      this.logger.log(`Server at ${dto.host} already registered as ${existing.name} — re-validating`);
      await this.coolify.ensureServerSshKey({
        name: keyName,
        description: `SSH key for ${coolifyName}`,
        privateKey: sshKey,
      });
      return this.validateAndWait(existing.uuid, tenantId);
    }

    let keyUuid: string;
    try {
      const key = await this.coolify.ensureServerSshKey({
        name: keyName,
        description: `SSH key for ${coolifyName}`,
        privateKey: sshKey,
      });
      keyUuid = key.uuid;
    } catch (e) {
      this.rethrowCoolifyError(e, "Coolify rejected the SSH private key.");
    }

    let createdUuid: string;
    try {
      const created = await this.coolify.createServer({
        name: coolifyName,
        description: dto.description ?? `Registered by Praxarch for tenant ${tenantId}`,
        ip: dto.host.trim(),
        port: dto.port ?? 22,
        user: dto.user ?? "root",
        privateKeyUuid: keyUuid,
        instantValidate: true,
        proxyType: dto.proxyType ?? "traefik",
      });
      createdUuid = created.uuid;
    } catch (e) {
      if (this.isDuplicateIpError(e)) {
        const retry = await this.findByHostForTenant(tenantId, dto.host);
        if (retry) {
          this.logger.log(`Reusing Coolify server ${retry.name} (${retry.uuid}) after duplicate IP response`);
          return this.validateAndWait(retry.uuid, tenantId);
        }
        throw new BadRequestException(
          `This IP is already registered in Coolify. Select it from the server dropdown below instead of adding it again.`
        );
      }
      this.rethrowCoolifyError(
        e,
        "Could not register the server with Coolify — check host, port, and SSH user."
      );
    }

    this.logger.log(`Registered Coolify server ${coolifyName} (${createdUuid}) for ${tenantId}`);

    return this.validateAndWait(createdUuid, tenantId);
  }
}
