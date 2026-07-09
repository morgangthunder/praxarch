import { Injectable, NotFoundException } from "@nestjs/common";
import { CoolifyEnvService } from "./coolify-env.service";
import { DeployTargetsService } from "./deploy-targets.service";
import { ServerPreflightService } from "./server-preflight.service";
import { CoolifyApiClient } from "./coolify-api.client";
import { CoolifyServersService } from "./coolify-servers.service";
import { runSshCommand } from "./remote-ssh.util";
import { DeploymentComposeService } from "./deployment-compose.service";

/** Keys often shared across staging/production (JWT/session signing). */
const CROSS_ENV_SECRET_KEYS = ["ADMIN_SECRET", "JWT_SECRET", "SESSION_SECRET", "secret"] as const;

/** Legacy Node apps (e.g. Bubblbook) sign JWTs with lowercase `process.env.secret`. */
const JWT_SIGNING_FALLBACK_KEYS = ["secret", "JWT_SECRET", "ADMIN_SECRET"] as const;

export interface EnvKeysComparison {
  serviceId: string;
  stagingKeys: string[];
  productionKeys: string[];
  missingInStaging: string[];
  missingInProduction: string[];
  secretComparison: Record<
    string,
    {
      inStaging: boolean;
      inProduction: boolean;
      sameValue: boolean | null;
      note: string;
    }
  >;
  guidance: string[];
}

export interface DeploymentDiagnosis {
  serviceId: string;
  environment: "staging" | "production";
  serverUuid: string | null;
  host: string | null;
  coolifyAppUuid: string | null;
  findings: Array<{ severity: "error" | "warn" | "info"; code: string; message: string }>;
  checks: {
    preflightReachable: boolean;
    appContainer: string | null;
    publishedHostPort: string | null;
    envPort: string | null;
    upstreamHttpCode: string | null;
    containerImage: string | null;
    composeImage: string | null;
    composeUsesBuild: boolean | null;
  };
  logExcerpt: string | null;
}

@Injectable()
export class DeploymentDiagnoseService {
  constructor(
    private readonly deployTargets: DeployTargetsService,
    private readonly coolifyEnv: CoolifyEnvService,
    private readonly preflight: ServerPreflightService,
    private readonly coolify: CoolifyApiClient,
    private readonly servers: CoolifyServersService,
    private readonly compose: DeploymentComposeService
  ) {}

  async compareEnvKeys(tenantId: string, serviceId: string): Promise<EnvKeysComparison> {
    const staging = await this.coolifyEnv.getVault(tenantId, serviceId, "staging");
    const production = await this.coolifyEnv.getVault(tenantId, serviceId, "production");

    const stagingKeys = Object.keys(staging).sort();
    const productionKeys = Object.keys(production).sort();
    const missingInStaging = productionKeys.filter((k) => !(k in staging));
    const missingInProduction = stagingKeys.filter((k) => !(k in production));

    const secretComparison: EnvKeysComparison["secretComparison"] = {};
    for (const key of CROSS_ENV_SECRET_KEYS) {
      const inStaging = Boolean(staging[key]);
      const inProduction = Boolean(production[key]);
      let sameValue: boolean | null = null;
      let note = "";
      if (inStaging && inProduction) {
        sameValue = staging[key] === production[key];
        note = sameValue
          ? `${key} is set in both environments with the same value.`
          : `${key} differs between staging and production.`;
      } else if (inProduction && !inStaging) {
        note = `${key} is set in production only. Staging can reuse the same value for JWT/session signing — use setServiceEnvVars with merge=true (never paste secrets in chat).`;
      } else if (inStaging && !inProduction) {
        note = `${key} is set in staging only.`;
      } else {
        note = `${key} is not set in either environment.`;
      }
      secretComparison[key] = { inStaging, inProduction, sameValue, note };
    }

    const guidance: string[] = [];
    if (missingInStaging.length) {
      guidance.push(
        `Staging is missing ${missingInStaging.length} key(s) present in production: ${missingInStaging.join(", ")}.`
      );
    }
    if (!staging.ADMIN_SECRET && production.ADMIN_SECRET) {
      guidance.push(
        "ADMIN_SECRET is in production but not staging. Apps using passport-jwt often need it — staging can use the same value as production."
      );
    }
    if (!staging.secret && (staging.ADMIN_SECRET || production.secret || production.ADMIN_SECRET)) {
      guidance.push(
        "Lowercase `secret` is missing in staging but a signing key exists under ADMIN_SECRET or production. Bubblbook-style apps use process.env.secret for jwt.sign — run deployments.ensureJwtSigningSecret."
      );
    }

    return {
      serviceId,
      stagingKeys,
      productionKeys,
      missingInStaging,
      missingInProduction,
      secretComparison,
      guidance,
    };
  }

  /** Copy a single key from production vault to staging (values never returned). */
  async mirrorKeyFromProduction(
    tenantId: string,
    serviceId: string,
    key: string
  ): Promise<{ key: string; synced: number }> {
    const allowed = new Set<string>(CROSS_ENV_SECRET_KEYS);
    if (!allowed.has(key)) {
      throw new NotFoundException(`Key ${key} cannot be mirrored — allowed: ${[...allowed].join(", ")}`);
    }
    const production = await this.coolifyEnv.getVault(tenantId, serviceId, "production");
    const value = production[key];
    if (!value) {
      throw new NotFoundException(`${key} is not set in production`);
    }
    const staging = await this.coolifyEnv.getVault(tenantId, serviceId, "staging");
    await this.coolifyEnv.storeVault(tenantId, serviceId, "staging", { ...staging, [key]: value });
    const target = await this.deployTargets.get(tenantId, serviceId, "staging");
    if (!target?.coolifyAppUuid) {
      throw new NotFoundException("Staging Coolify app not provisioned");
    }
    const synced = await this.coolifyEnv.syncToApplication(target.coolifyAppUuid, {
      ...staging,
      [key]: value,
    });
    return { key, synced };
  }

  /**
   * Ensure lowercase `secret` is set for legacy JWT apps (passport-jwt + jwt.sign).
   * Copies from same-env ADMIN_SECRET, then production secret/ADMIN_SECRET. Never returns values.
   */
  async ensureJwtSigningSecret(
    tenantId: string,
    serviceId: string,
    environment: "staging" | "production"
  ): Promise<{ environment: string; key: string; source: string; synced: number }> {
    const vault = await this.coolifyEnv.getVault(tenantId, serviceId, environment);
    if (vault.secret?.trim()) {
      return { environment, key: "secret", source: "already-set", synced: 0 };
    }

    const production = await this.coolifyEnv.getVault(tenantId, serviceId, "production");
    let source = "";
    let value = "";
    for (const candidate of JWT_SIGNING_FALLBACK_KEYS) {
      if (candidate === "secret") continue;
      const fromEnv = vault[candidate]?.trim();
      if (fromEnv) {
        value = fromEnv;
        source = `${candidate}-same-env`;
        break;
      }
    }
    if (!value) {
      for (const candidate of JWT_SIGNING_FALLBACK_KEYS) {
        const fromProd = production[candidate]?.trim();
        if (fromProd) {
          value = fromProd;
          source = `${candidate}-production`;
          break;
        }
      }
    }
    if (!value) {
      throw new NotFoundException(
        "No JWT signing secret found — set secret, JWT_SECRET, or ADMIN_SECRET in the vault first."
      );
    }

    const merged = { ...vault, secret: value };
    await this.coolifyEnv.storeVault(tenantId, serviceId, environment, merged);
    const target = await this.deployTargets.get(tenantId, serviceId, environment);
    if (!target?.coolifyAppUuid) {
      throw new NotFoundException(`No Coolify app for ${serviceId}/${environment}`);
    }
    const synced = await this.coolifyEnv.syncToApplication(target.coolifyAppUuid, { secret: value });
    return { environment, key: "secret", source, synced };
  }

  async diagnose(
    tenantId: string,
    serviceId: string,
    environment: "staging" | "production"
  ): Promise<DeploymentDiagnosis> {
    const target = await this.deployTargets.get(tenantId, serviceId, environment);
    if (!target?.coolifyServerUuid) {
      throw new NotFoundException(`No deploy target for ${serviceId}/${environment}`);
    }

    const envs = await this.coolifyEnv.getVault(tenantId, serviceId, environment);
    const envPort = envs.PORT?.trim() || target.portsExposes || null;
    const findings: DeploymentDiagnosis["findings"] = [];
    const checks: DeploymentDiagnosis["checks"] = {
      preflightReachable: false,
      appContainer: null,
      publishedHostPort: null,
      envPort,
      upstreamHttpCode: null,
      containerImage: null,
      composeImage: null,
      composeUsesBuild: null,
    };

    const scan = await this.preflight.scan(target.coolifyServerUuid, tenantId);
    checks.preflightReachable = scan.reachable;

    const appUuid = target.coolifyAppUuid ?? "";
    const appContainer =
      scan.containers.find(
        (c) => c.coolifyManaged && (appUuid ? c.name.includes(appUuid.slice(0, 12)) : c.name.startsWith("app-"))
      ) ?? scan.containers.find((c) => c.coolifyManaged && c.publishedPorts.length > 0);

    if (appContainer) {
      checks.appContainer = appContainer.name;
      const hostPort = this.extractHostPort(appContainer.publishedPorts[0]);
      checks.publishedHostPort = hostPort;

      if (envPort && hostPort && envPort !== hostPort) {
        findings.push({
          severity: "error",
          code: "port-mismatch",
          message: `App env PORT=${envPort} but Docker publishes host port ${hostPort}. nginx must proxy to the host port; the app must listen on the container port Docker maps (set PORT=${hostPort}).`,
        });
      }

      if (scan.proxyOwner === "nginx" && hostPort) {
        findings.push({
          severity: "info",
          code: "nginx-front-door",
          message: `nginx owns 80/443 — ensure its upstream points to 127.0.0.1:${hostPort}.`,
        });
        for (const route of scan.nginxRoutes ?? []) {
          if (!route.listening) {
            findings.push({
              severity: "error",
              code: "nginx-dead-upstream",
              message: `nginx ${route.location} → localhost:${route.port} has no listener (502 on that prefix). Run wizard Reconcile with "Retarget dead nginx upstreams" to port ${hostPort}.`,
            });
          }
        }
      }
    } else {
      findings.push({
        severity: "warn",
        code: "no-app-container",
        message: "No Coolify-managed app container with published ports found on the server.",
      });
    }

    if (envs.REDIS_HOST === "localhost" || envs.REDIS_HOST === "127.0.0.1") {
      findings.push({
        severity: "warn",
        code: "redis-localhost",
        message:
          "REDIS_HOST is localhost — in Docker Compose use the redis service name (e.g. redis), not localhost.",
      });
    }

    if (!envs.secret?.trim() && !envs.ADMIN_SECRET && !envs.JWT_SECRET) {
      findings.push({
        severity: "warn",
        code: "missing-jwt-secret",
        message:
          "Neither secret, ADMIN_SECRET, nor JWT_SECRET is set. Legacy apps (jwt.sign / passport-jwt) need lowercase `secret`.",
      });
    } else if (!envs.secret?.trim() && (envs.ADMIN_SECRET || envs.JWT_SECRET)) {
      findings.push({
        severity: "error",
        code: "jwt-secret-alias-missing",
        message:
          "ADMIN_SECRET/JWT_SECRET is in the vault but lowercase `secret` is missing. Bubblbook uses process.env.secret for login JWTs — run deployments.ensureJwtSigningSecret then redeploy.",
      });
    }

    let logExcerpt: string | null = null;
    if (scan.reachable && checks.appContainer && checks.publishedHostPort) {
      try {
        const { host, port, user, privateKey } = await this.sshTarget(
          target.coolifyServerUuid,
          tenantId
        );
        const probe = await runSshCommand({
          host,
          port,
          user,
          privateKey,
          command: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${checks.publishedHostPort}/ 2>/dev/null || echo '000'`,
          timeoutMs: 30_000,
        });
        checks.upstreamHttpCode = probe.stdout.trim() || "000";

        if (checks.upstreamHttpCode === "000" || checks.upstreamHttpCode === "502") {
          findings.push({
            severity: "error",
            code: "upstream-down",
            message: `curl to 127.0.0.1:${checks.publishedHostPort} returned HTTP ${checks.upstreamHttpCode} — nginx will show 502 even if Coolify reports success.`,
          });
        } else if (checks.upstreamHttpCode.startsWith("2") || checks.upstreamHttpCode.startsWith("3")) {
          findings.push({
            severity: "info",
            code: "upstream-ok",
            message: `Upstream on port ${checks.publishedHostPort} responds HTTP ${checks.upstreamHttpCode}.`,
          });
        }

        const logs = await runSshCommand({
          host,
          port,
          user,
          privateKey,
          command: `docker logs ${checks.appContainer} --tail 35 2>&1 | tail -35`,
          timeoutMs: 30_000,
        });
        logExcerpt = this.redactSecrets(logs.stdout || logs.stderr).slice(-2500);
        if (/JwtStrategy requires a secret/i.test(logExcerpt)) {
          findings.push({
            severity: "error",
            code: "jwt-strategy-missing-secret",
            message:
              "Container logs show JwtStrategy missing a secret — add ADMIN_SECRET (staging can match production).",
          });
        }
        const listenMatch = logExcerpt.match(/Server started on port (\d+)/i);
        if (listenMatch && checks.publishedHostPort && listenMatch[1] !== checks.publishedHostPort) {
          findings.push({
            severity: "error",
            code: "listen-port-mismatch",
            message: `App logs say it listens on port ${listenMatch[1]} but Docker/nginx expect ${checks.publishedHostPort}.`,
          });
        }

        const mcpProbe = await runSshCommand({
          host,
          port,
          user,
          privateKey,
          command: `docker ps --format '{{.Names}}' | grep -q mcp-server && docker exec ${checks.appContainer} node -e "require('http').get('http://mcp:3400/health',r=>process.stdout.write(String(r.statusCode))).on('error',()=>process.stdout.write('err'))" 2>/dev/null || echo skip`,
          timeoutMs: 20_000,
        });
        const mcpCode = (mcpProbe.stdout || "").trim();
        if (mcpCode === "err" || mcpCode === "000") {
          findings.push({
            severity: "error",
            code: "mcp-network-isolated",
            message:
              "App cannot reach MCP at http://mcp:3400 (containers on different Docker networks). Run deployments.ensureMcpOverlay to reconnect.",
          });
        } else if (mcpCode === "200") {
          findings.push({
            severity: "info",
            code: "mcp-reachable",
            message: "App container can reach MCP at http://mcp:3400/health.",
          });
        }
      } catch (err) {
        findings.push({
          severity: "warn",
          code: "ssh-probe-failed",
          message: `Could not SSH-probe the server: ${(err as Error).message}`,
        });
      }
    }

    for (const c of scan.conflicts.filter((x) => x.severity === "block")) {
      findings.push({
        severity: "error",
        code: "preflight-block",
        message: c.message,
      });
    }

    if (scan.reachable && target.coolifyAppUuid) {
      try {
        const imageAudit = await this.compose.auditImage(tenantId, serviceId, environment);
        if (imageAudit) {
          checks.containerImage = imageAudit.containerImage;
          checks.composeImage = imageAudit.composeImage;
          checks.composeUsesBuild = imageAudit.composeUsesBuild;
          if (imageAudit.stalePrebuiltImage) {
            findings.push({
              severity: "error",
              code: "stale-prebuilt-image",
              message: `docker-compose.yml pins image "${imageAudit.composeImage}" but git checkout has features missing in the container (${imageAudit.missingInContainer.map((m) => m.label).join(", ")}). Run deployments.buildFromSource to build from the repo Dockerfile.`,
            });
          } else if (imageAudit.missingInContainer.length) {
            findings.push({
              severity: "warn",
              code: "repo-container-drift",
              message: `Repo has ${imageAudit.missingInContainer.map((m) => m.label).join(", ")} but the running container does not — redeploy or buildFromSource may be needed.`,
            });
          }
          if (envs.GEMINI_API_KEY && imageAudit.missingInContainer.some((m) => m.label.includes("onboarding"))) {
            findings.push({
              severity: "error",
              code: "onboarding-env-without-code",
              message:
                "GEMINI_API_KEY is set but the running container lacks onboarding agent routes — LLM keys alone cannot enable the assistant until buildFromSource deploys current code.",
            });
          }
        }
      } catch (err) {
        findings.push({
          severity: "warn",
          code: "compose-audit-failed",
          message: `Could not audit compose image vs repo: ${(err as Error).message}`,
        });
      }
    }

    return {
      serviceId,
      environment,
      serverUuid: target.coolifyServerUuid,
      host: scan.host,
      coolifyAppUuid: target.coolifyAppUuid,
      findings,
      checks,
      logExcerpt,
    };
  }

  private extractHostPort(published?: string): string | null {
    if (!published) return null;
    const m = published.match(/0\.0\.0\.0:(\d+)->/);
    return m?.[1] ?? null;
  }

  private redactSecrets(text: string): string {
    return text
      .replace(/mongodb(\+srv)?:\/\/[^\s'"]+/gi, "mongodb://[REDACTED]")
      .replace(/(sk_|pk_|ghsec_|whsec_)[A-Za-z0-9_-]+/g, "$1[REDACTED]");
  }

  private async sshTarget(uuid: string, tenantId: string) {
    const raw = await this.coolify.getServer(uuid);
    if (!this.servers.isVisibleToTenant(raw, tenantId)) {
      throw new NotFoundException("Server not found for this tenant");
    }
    const host = raw.ip ?? null;
    const port = (raw as { port?: number }).port ?? 22;
    const user = (raw as { user?: string }).user ?? "root";
    if (!host) throw new NotFoundException("Server has no IP");
    const privateKey = await this.coolify.getServerPrivateKeyMaterial(uuid);
    if (!privateKey) throw new NotFoundException("Server SSH key unavailable");
    return { host, port, user, privateKey };
  }
}
