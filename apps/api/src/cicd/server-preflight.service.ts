import { BadRequestException, HttpException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { CoolifyApiClient } from "./coolify-api.client";
import { CoolifyServersService } from "./coolify-servers.service";
import { runSshCommand } from "./remote-ssh.util";
import {
  buildNginxRetargetCommand,
  buildNginxRoutesScanCommand,
  deadNginxUpstreamPorts,
  parseNginxRoutesScan,
  type NginxUpstreamRoute,
} from "./nginx-routes.util";

export type ConflictKind = "legacy-container" | "port" | "proxy" | "data-volume" | "nginx-upstream";
export type ConflictSeverity = "block" | "warn" | "info";

export interface PreflightContainer {
  name: string;
  image: string;
  publishedPorts: string[];
  status: string;
  coolifyManaged: boolean;
}

export interface PreflightConflict {
  kind: ConflictKind;
  severity: ConflictSeverity;
  message: string;
  /** container name / port / volume the action would target */
  target?: string;
}

export interface PreflightReport {
  serverUuid: string;
  host: string | null;
  reachable: boolean;
  scanError?: string;
  /** who currently holds 80/443 on the host */
  proxyOwner: "nginx" | "traefik" | "caddy" | "apache" | "other" | "none";
  proxyHolder80: string | null;
  proxyHolder443: string | null;
  containers: PreflightContainer[];
  volumes: string[];
  conflicts: PreflightConflict[];
  /** container names Praxarch suggests stopping so Coolify can take over */
  suggestedStopContainers: string[];
  /** nginx location → upstream port map (when nginx owns 80/443) */
  nginxRoutes?: NginxUpstreamRoute[];
}

export interface ReconcilePlan {
  /** container names to stop & remove (data volumes are preserved) */
  stopContainers?: string[];
  /** set the Coolify server proxy to "none" (keep an existing nginx/Caddy front door) */
  setProxyNone?: boolean;
  /** Retarget nginx proxy_pass ports with no listener to this Coolify app port (e.g. 3303). */
  retargetDeadNginxUpstreamsTo?: number;
}

export interface ReconcileResult {
  stopped: string[];
  failed: { target: string; error: string }[];
  proxySetNone: boolean;
  proxyMessage?: string;
  nginxRetargeted?: number[];
  nginxMessage?: string;
}

const SECTION = {
  containers: "@@CONTAINERS@@",
  port80: "@@PORT80@@",
  port443: "@@PORT443@@",
  volumes: "@@VOLUMES@@",
  end: "@@END@@",
};

/**
 * Read-only server scan + consent-gated reconciliation for "brownfield" takeovers —
 * servers that already run an app via a non-Coolify stack (manual docker compose,
 * PM2 behind nginx, etc.). The scan never mutates the host; reconcile only runs the
 * explicit actions the caller approved.
 */
@Injectable()
export class ServerPreflightService {
  private readonly logger = new Logger(ServerPreflightService.name);

  constructor(
    private readonly coolify: CoolifyApiClient,
    private readonly servers: CoolifyServersService
  ) {}

  private buildScanCommand(): string {
    // One-shot, section-delimited output so we can parse deterministically.
    // `sudo -n` is tried first for ss (needs root to see process names) then falls back.
    return [
      `echo "${SECTION.containers}"`,
      `docker ps -a --format '{{.Names}}\\t{{.Image}}\\t{{.Ports}}\\t{{.Status}}\\t{{.Label "coolify.managed"}}' 2>/dev/null || true`,
      `echo "${SECTION.port80}"`,
      `(sudo -n ss -tlnp 2>/dev/null || ss -tlnp 2>/dev/null) | grep -E ':80 ' || true`,
      `echo "${SECTION.port443}"`,
      `(sudo -n ss -tlnp 2>/dev/null || ss -tlnp 2>/dev/null) | grep -E ':443 ' || true`,
      `echo "${SECTION.volumes}"`,
      `docker volume ls --format '{{.Name}}' 2>/dev/null || true`,
      `echo "${SECTION.end}"`,
    ].join("; ");
  }

  private async sshTarget(uuid: string, tenantId: string) {
    const raw = await this.coolify.getServer(uuid);
    if (!this.servers.isVisibleToTenant(raw, tenantId)) {
      throw new NotFoundException("Server not found for this tenant");
    }
    const host = raw.ip ?? null;
    const port = (raw as { port?: number }).port ?? 22;
    const user = (raw as { user?: string }).user ?? "root";
    if (!host) {
      throw new BadRequestException("Server has no IP/host registered in Coolify");
    }
    const privateKey = await this.coolify.getServerPrivateKeyMaterial(uuid).catch(() => null);
    if (!privateKey) {
      throw new BadRequestException(
        "Could not retrieve the server SSH key from Coolify — re-register the server with its private key."
      );
    }
    return { host, port, user, privateKey };
  }

  async scan(uuid: string, tenantId: string): Promise<PreflightReport> {
    const { host, port, user, privateKey } = await this.sshTarget(uuid, tenantId);

    const base: PreflightReport = {
      serverUuid: uuid,
      host,
      reachable: false,
      proxyOwner: "none",
      proxyHolder80: null,
      proxyHolder443: null,
      containers: [],
      volumes: [],
      conflicts: [],
      suggestedStopContainers: [],
    };

    let stdout = "";
    try {
      const res = await runSshCommand({
        host,
        port,
        user,
        privateKey,
        command: this.buildScanCommand(),
        timeoutMs: 60_000,
      });
      stdout = res.stdout;
    } catch (err) {
      return { ...base, scanError: (err as Error).message?.slice(0, 300) ?? "SSH scan failed" };
    }

    return this.attachNginxRoutes(this.classify(base, stdout), { host, port, user, privateKey });
  }

  private parseSections(stdout: string): Record<keyof typeof SECTION, string[]> {
    const lines = stdout.split(/\r?\n/);
    const out = { containers: [], port80: [], port443: [], volumes: [], end: [] } as Record<
      keyof typeof SECTION,
      string[]
    >;
    let current: keyof typeof SECTION | null = null;
    const marker = new Map(Object.entries(SECTION).map(([k, v]) => [v, k as keyof typeof SECTION]));
    for (const line of lines) {
      const trimmed = line.trim();
      if (marker.has(trimmed)) {
        current = marker.get(trimmed)!;
        continue;
      }
      if (current && trimmed) out[current].push(line);
    }
    return out;
  }

  private detectProxyHolder(portLines: string[]): string | null {
    for (const line of portLines) {
      const m = line.match(/users:\(\("([^"]+)"/);
      if (m) return m[1];
    }
    return portLines.length > 0 ? "unknown" : null;
  }

  private classifyProxyOwner(holder: string | null): PreflightReport["proxyOwner"] {
    if (!holder) return "none";
    const h = holder.toLowerCase();
    if (h.includes("nginx")) return "nginx";
    if (h.includes("traefik") || h.includes("coolify-proxy")) return "traefik";
    if (h.includes("caddy")) return "caddy";
    if (h.includes("apache") || h.includes("httpd")) return "apache";
    return "other";
  }

  private classify(base: PreflightReport, stdout: string): PreflightReport {
    const sections = this.parseSections(stdout);

    const containers: PreflightContainer[] = sections.containers.map((line) => {
      const [name = "", image = "", ports = "", status = "", managed = ""] = line.split("\t");
      const publishedPorts = ports
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.includes("->"));
      return {
        name: name.trim(),
        image: image.trim(),
        publishedPorts,
        status: status.trim(),
        coolifyManaged: managed.trim() === "true",
      };
    });

    const holder80 = this.detectProxyHolder(sections.port80);
    const holder443 = this.detectProxyHolder(sections.port443);
    const proxyOwner = this.classifyProxyOwner(holder443 ?? holder80);

    const volumes = sections.volumes.map((v) => v.trim()).filter(Boolean);

    const conflicts: PreflightConflict[] = [];
    const suggestedStop: string[] = [];

    for (const c of containers) {
      if (c.coolifyManaged) continue;
      if (c.name === "coolify-sentinel" || c.name === "coolify-proxy") continue;
      // A non-Coolify container that publishes host ports is a takeover blocker:
      // Coolify's compose deploy will collide on those same ports.
      if (c.publishedPorts.length > 0) {
        conflicts.push({
          kind: "legacy-container",
          severity: "block",
          message: `"${c.name}" (${c.image}) publishes ${c.publishedPorts.join(", ")} — Coolify will collide on these ports.`,
          target: c.name,
        });
        suggestedStop.push(c.name);
      }
    }

    if (proxyOwner === "nginx" || proxyOwner === "caddy" || proxyOwner === "apache") {
      conflicts.push({
        kind: "proxy",
        severity: "warn",
        message: `${holder443 ?? holder80} already serves ports 80/443. Keep it as the front door and set Coolify's proxy to "none" (recommended), or hand 80/443 to Coolify's Traefik.`,
        target: proxyOwner,
      });
    }

    const dataVolumes = volumes.filter((v) => /mongo|redis|postgres|pg|mysql|data/i.test(v));
    if (dataVolumes.length > 0) {
      conflicts.push({
        kind: "data-volume",
        severity: "info",
        message: `Existing data volumes detected (${dataVolumes.slice(0, 4).join(", ")}${dataVolumes.length > 4 ? "…" : ""}). Removing containers preserves these; they are never deleted automatically.`,
      });
    }

    return {
      ...base,
      reachable: true,
      proxyOwner,
      proxyHolder80: holder80,
      proxyHolder443: holder443,
      containers,
      volumes,
      conflicts,
      suggestedStopContainers: suggestedStop,
    };
  }

  private async attachNginxRoutes(
    report: PreflightReport,
    ssh: { host: string; port: number; user: string; privateKey: string }
  ): Promise<PreflightReport> {
    if (report.proxyOwner !== "nginx" || !report.reachable) return report;
    try {
      const nginxScan = await runSshCommand({
        ...ssh,
        command: buildNginxRoutesScanCommand(),
        timeoutMs: 45_000,
      });
      const nginxRoutes = parseNginxRoutesScan(nginxScan.stdout || "");
      const conflicts = [...report.conflicts];
      const dead = deadNginxUpstreamPorts(nginxRoutes);
      for (const route of nginxRoutes.filter((r) => !r.listening)) {
        conflicts.push({
          kind: "nginx-upstream",
          severity: "warn",
          message: `nginx location ${route.location} proxies to localhost:${route.port} but nothing is listening — routes under this prefix will 502 (e.g. connected apps on ${route.location}). Retarget to the Coolify app port during reconcile.`,
          target: String(route.port),
        });
      }
      if (dead.length > 0) {
        conflicts.push({
          kind: "nginx-upstream",
          severity: "block",
          message: `Dead nginx upstream port(s): ${dead.join(", ")}. Reconcile can retarget them to your Coolify app PORT so connected apps (agreeatime, /2/socket.io) work after deploy.`,
        });
      }
      return { ...report, nginxRoutes, conflicts };
    } catch (err) {
      return {
        ...report,
        conflicts: [
          ...report.conflicts,
          {
            kind: "nginx-upstream",
            severity: "info",
            message: `Could not scan nginx routes: ${(err as Error).message?.slice(0, 120)}`,
          },
        ],
      };
    }
  }

  private assertSafeContainerName(name: string): void {
    if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(name)) {
      throw new BadRequestException(`Invalid container name: ${name}`);
    }
    if (name === "coolify-proxy" || name === "coolify-sentinel") {
      throw new BadRequestException(`Refusing to remove Coolify infrastructure container: ${name}`);
    }
  }

  /**
   * Execute a consented reconciliation. Only the actions passed in `plan` run.
   * `docker rm -f` (no -v) stops+removes containers while preserving named volumes.
   */
  async reconcile(uuid: string, tenantId: string, plan: ReconcilePlan): Promise<ReconcileResult> {
    const result: ReconcileResult = { stopped: [], failed: [], proxySetNone: false };

    const stopContainers = plan.stopContainers ?? [];
    stopContainers.forEach((n) => this.assertSafeContainerName(n));

    const ssh =
      stopContainers.length > 0 || plan.retargetDeadNginxUpstreamsTo
        ? await this.sshTarget(uuid, tenantId)
        : null;
    const host = ssh?.host;
    const port = ssh?.port ?? 22;
    const user = ssh?.user ?? "root";
    const privateKey = ssh?.privateKey;

    if (plan.setProxyNone) {
      try {
        await this.coolify.updateServer(uuid, { proxyType: "none" });
        result.proxySetNone = true;
      } catch (err) {
        result.proxyMessage = `Could not set Coolify proxy to none: ${(err as Error).message?.slice(0, 160)}`;
        this.logger.warn(result.proxyMessage);
      }
    }

    if (plan.retargetDeadNginxUpstreamsTo && host && privateKey) {
      try {
        const scan = await this.scan(uuid, tenantId);
        const dead = deadNginxUpstreamPorts(scan.nginxRoutes ?? []);
        if (dead.length) {
          const cmd = buildNginxRetargetCommand(dead, plan.retargetDeadNginxUpstreamsTo);
          await runSshCommand({
            host,
            port,
            user,
            privateKey,
            command: cmd,
            timeoutMs: 60_000,
          });
          result.nginxRetargeted = dead;
          result.nginxMessage = `Retargeted nginx upstream port(s) ${dead.join(", ")} → ${plan.retargetDeadNginxUpstreamsTo}`;
          this.logger.log(`Reconcile: ${result.nginxMessage} on ${uuid}`);
        } else {
          result.nginxMessage = "No dead nginx upstream ports found — nothing to retarget.";
        }
      } catch (err) {
        result.nginxMessage = `nginx retarget failed: ${(err as Error).message?.slice(0, 200)}`;
        this.logger.warn(result.nginxMessage);
      }
    }

    if (stopContainers.length > 0 && host && privateKey) {
      for (const name of stopContainers) {
        try {
          await runSshCommand({
            host,
            port,
            user,
            privateKey,
            command: `docker rm -f ${name}`,
            timeoutMs: 60_000,
          });
          result.stopped.push(name);
          this.logger.log(`Reconcile: removed legacy container "${name}" on ${uuid} (${tenantId})`);
        } catch (err) {
          result.failed.push({ target: name, error: (err as Error).message?.slice(0, 200) ?? "failed" });
        }
      }
    }

    if (
      result.failed.length > 0 &&
      result.stopped.length === 0 &&
      !result.proxySetNone &&
      !result.nginxRetargeted?.length
    ) {
      throw new HttpException(
        { message: "Reconcile actions failed", failed: result.failed },
        502
      );
    }

    return result;
  }
}
