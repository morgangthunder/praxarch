import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../common/database/database.service";
import { DeployServiceRecord, ServiceEnvironment } from "./services.types";
import { CreateServiceDto, UpdateServiceDto } from "./dto/service.dto";

interface ServiceRow {
  id: string;
  name: string;
  repo: string;
  kind: "app" | "service";
  environments: ServiceEnvironment[];
}

/** Builds the standard prod+staging environment pair for a new service. */
function freshEnvironments(branch: string): ServiceEnvironment[] {
  const now = new Date().toISOString();
  const base = { branch, commit: "—", version: "v0.0.0", status: "idle", deployedAt: now };
  return [
    { environment: "production", ...base },
    { environment: "staging", ...base },
  ];
}

/** Default services seeded the first time a tenant opens Deployments. */
function defaultServices(tenant: string): DeployServiceRecord[] {
  return [
    {
      id: "web",
      name: "Web App",
      repo: `${tenant}/web`,
      kind: "app",
      environments: [
        { environment: "production", branch: "main", commit: "a1b2c3d", version: "v1.4.0", status: "active", deployedAt: "2026-06-03T12:00:00Z" },
        { environment: "staging", branch: "main", commit: "e4f5a6b", version: "v1.5.0-rc.1", status: "active", deployedAt: "2026-06-05T09:30:00Z", aheadOfProd: true },
      ],
    },
    {
      id: "marketing-site",
      name: "Marketing Site",
      repo: `${tenant}/marketing`,
      kind: "app",
      environments: [
        { environment: "production", branch: "main", commit: "9c8d7e6", version: "v2.1.0", status: "active", deployedAt: "2026-06-04T15:20:00Z" },
        { environment: "staging", branch: "main", commit: "9c8d7e6", version: "v2.1.0", status: "idle", deployedAt: "2026-06-04T15:20:00Z" },
      ],
    },
  ];
}

@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);

  constructor(private readonly db: DatabaseService) {}

  async get(tenantId: string, id: string): Promise<DeployServiceRecord | null> {
    const rows = await this.db.query<ServiceRow>(
      `SELECT id, name, repo, kind, environments FROM public.deploy_services
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async list(tenantId: string): Promise<DeployServiceRecord[]> {
    const rows = await this.db.query<ServiceRow>(
      `SELECT id, name, repo, kind, environments FROM public.deploy_services
       WHERE tenant_id = $1 ORDER BY created_at`,
      [tenantId]
    );
    if (rows.length > 0) return rows.map(this.toRecord);

    // Lazy seed so the view has demo data the first time, then it's mutable.
    const seeded = defaultServices(tenantId);
    for (const s of seeded) await this.insert(tenantId, s);
    this.logger.log(`Seeded ${seeded.length} default services for ${tenantId}`);
    return seeded;
  }

  async create(tenantId: string, dto: CreateServiceDto): Promise<DeployServiceRecord> {
    const id =
      (dto.name || "web-app").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") ||
      `svc-${Date.now()}`;
    const record: DeployServiceRecord = {
      id,
      name: dto.name,
      repo: dto.repo,
      kind: dto.kind ?? "app",
      environments: freshEnvironments(dto.branch ?? "main"),
    };
    await this.insert(tenantId, record);
    this.logger.log(`Created service ${tenantId}/${id}`);
    return record;
  }

  async updateConfig(
    tenantId: string,
    id: string,
    dto: UpdateServiceDto
  ): Promise<DeployServiceRecord | null> {
    const rows = await this.db.query<ServiceRow>(
      `SELECT id, name, repo, kind, environments FROM public.deploy_services
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    if (!rows[0]) return null;
    const current = this.toRecord(rows[0]);

    const repo = dto.repo ?? current.repo;
    const environments = dto.branch
      ? current.environments.map((e) => ({ ...e, branch: dto.branch as string }))
      : current.environments;

    await this.db.query(
      `UPDATE public.deploy_services SET repo = $3, environments = $4
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id, repo, JSON.stringify(environments)]
    );
    return { ...current, repo, environments };
  }

  /**
   * Reflect a finished deploy on the service's environment row (Kanban-style status).
   */
  async applyDeployOutcome(
    tenantId: string,
    serviceId: string,
    environment: "staging" | "production",
    outcome: {
      status: "active" | "error" | "pending";
      tag: string;
      commitSha?: string;
      deployedAt?: string;
    }
  ): Promise<DeployServiceRecord | null> {
    const current = await this.get(tenantId, serviceId);
    if (!current) return null;

    const deployedAt = outcome.deployedAt ?? new Date().toISOString();
    const commit = outcome.commitSha?.slice(0, 7) ?? "—";
    const version = outcome.tag.startsWith("v") ? outcome.tag : `v${outcome.tag}`;

    let environments = current.environments.map((e) => {
      if (e.environment !== environment) return e;
      return {
        ...e,
        status: outcome.status,
        version,
        commit,
        deployedAt,
        aheadOfProd: environment === "staging" ? true : undefined,
      };
    });

    if (environment === "production") {
      environments = environments.map((e) => {
        if (e.environment === "staging") return { ...e, aheadOfProd: false };
        return e;
      });
    }

    await this.db.query(
      `UPDATE public.deploy_services SET environments = $3
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, serviceId, JSON.stringify(environments)]
    );
    return { ...current, environments };
  }

  private async insert(tenantId: string, s: DeployServiceRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO public.deploy_services (id, tenant_id, name, repo, kind, environments)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (tenant_id, id) DO NOTHING`,
      [s.id, tenantId, s.name, s.repo, s.kind, JSON.stringify(s.environments)]
    );
  }

  private toRecord(r: ServiceRow): DeployServiceRecord {
    return { id: r.id, name: r.name, repo: r.repo, kind: r.kind, environments: r.environments };
  }
}
