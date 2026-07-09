import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { EventEmitter } from "node:events";
import { DatabaseService } from "../common/database/database.service";
import type { DeployRunRecord, DeployRunStatus } from "./deploy-runs.types";

interface DeployRunRow {
  id: string;
  tenant_id: string;
  project: string;
  service_id: string | null;
  environment: "staging" | "production";
  status: DeployRunStatus;
  tag: string;
  actor: string;
  driver: "simulate" | "coolify" | "ssh-build" | "ecr-release";
  commit_sha: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class DeployRunsService {
  private readonly logger = new Logger(DeployRunsService.name);
  private readonly bus = new EventEmitter();

  constructor(private readonly db: DatabaseService) {}

  async create(input: {
    id: string;
    tenantId: string;
    project: string;
    serviceId?: string;
    environment: "staging" | "production";
    tag: string;
    actor: string;
    driver: "simulate" | "coolify" | "ssh-build" | "ecr-release";
  }): Promise<DeployRunRecord> {
    const rows = await this.db.query<DeployRunRow>(
      `INSERT INTO public.deploy_runs
         (id, tenant_id, project, service_id, environment, status, tag, actor, driver)
       VALUES ($1,$2,$3,$4,$5,'queued',$6,$7,$8)
       RETURNING *`,
      [
        input.id,
        input.tenantId,
        input.project,
        input.serviceId ?? null,
        input.environment,
        input.tag,
        input.actor,
        input.driver,
      ]
    );
    const run = this.toRecord(rows[0]);
    this.publish(run);
    return run;
  }

  async get(tenantId: string, id: string): Promise<DeployRunRecord | null> {
    const rows = await this.db.query<DeployRunRow>(
      `SELECT * FROM public.deploy_runs WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async getById(id: string): Promise<DeployRunRecord | null> {
    const rows = await this.db.query<DeployRunRow>(
      `SELECT * FROM public.deploy_runs WHERE id = $1`,
      [id]
    );
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async listByTenant(tenantId: string, limit = 20): Promise<DeployRunRecord[]> {
    const rows = await this.db.query<DeployRunRow>(
      `SELECT * FROM public.deploy_runs
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, limit]
    );
    return rows.map((row) => this.toRecord(row));
  }

  async updateStatus(
    id: string,
    status: DeployRunStatus,
    extra?: { commitSha?: string; errorMessage?: string }
  ): Promise<DeployRunRecord> {
    const rows = await this.db.query<DeployRunRow>(
      `UPDATE public.deploy_runs
       SET status = $2,
           commit_sha = COALESCE($3, commit_sha),
           error_message = COALESCE($4, error_message),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, status, extra?.commitSha ?? null, extra?.errorMessage ?? null]
    );
    if (!rows[0]) throw new NotFoundException("Deploy run not found");
    const run = this.toRecord(rows[0]);
    this.publish(run);
    this.logger.log(`Deploy ${id} → ${status}`);
    return run;
  }

  subscribe(id: string, listener: (run: DeployRunRecord) => void): () => void {
    const channel = this.channel(id);
    this.bus.on(channel, listener);
    return () => this.bus.off(channel, listener);
  }

  private publish(run: DeployRunRecord): void {
    this.bus.emit(this.channel(run.id), run);
  }

  private channel(id: string): string {
    return `deploy:${id}`;
  }

  private toRecord(row: DeployRunRow): DeployRunRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      project: row.project,
      serviceId: row.service_id,
      environment: row.environment,
      status: row.status,
      tag: row.tag,
      actor: row.actor,
      driver: row.driver,
      commitSha: row.commit_sha,
      errorMessage: row.error_message,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
