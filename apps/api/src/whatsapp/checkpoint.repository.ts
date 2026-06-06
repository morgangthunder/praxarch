import { Injectable, Logger } from "@nestjs/common";
import { Checkpoint } from "./checkpoint.types";
import { DatabaseService } from "../common/database/database.service";

/**
 * Persistence boundary for checkpoints.
 *
 * `PgCheckpointRepository` writes to `public.hitl_checkpoints` (keyed by
 * tenant_id; schema-per-tenant in production). `InMemoryCheckpointRepository`
 * is the fallback when no database is configured.
 */
export abstract class CheckpointRepository {
  abstract create(checkpoint: Checkpoint): Promise<Checkpoint>;
  /** Look up by the approver's phone — the only key an inbound SMS gives us. */
  abstract findLatestAwaitingByApprover(approverWaId: string): Promise<Checkpoint | null>;
  abstract findById(id: string): Promise<Checkpoint | null>;
  abstract updateStatus(id: string, status: Checkpoint["status"]): Promise<void>;
}

interface CheckpointRow {
  id: string;
  tenant_id: string;
  execution_id: string | null;
  resume_token: string | null;
  kind: Checkpoint["kind"];
  action: Checkpoint["action"];
  summary: string;
  approver_wa_id: string;
  status: Checkpoint["status"];
  created_at: Date;
  expires_at: Date;
}

function rowToCheckpoint(r: CheckpointRow): Checkpoint {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    executionId: r.execution_id ?? undefined,
    resumeToken: r.resume_token ?? undefined,
    kind: r.kind,
    action: r.action,
    summary: r.summary,
    approverWaId: r.approver_wa_id,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    expiresAt: new Date(r.expires_at).toISOString(),
  };
}

@Injectable()
export class PgCheckpointRepository extends CheckpointRepository {
  private readonly logger = new Logger(PgCheckpointRepository.name);

  constructor(private readonly db: DatabaseService) {
    super();
  }

  async create(c: Checkpoint): Promise<Checkpoint> {
    await this.db.query(
      `INSERT INTO public.hitl_checkpoints
         (id, tenant_id, execution_id, resume_token, kind, action, summary, approver_wa_id, status, created_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        c.id,
        c.tenantId,
        c.executionId ?? null,
        c.resumeToken ?? null,
        c.kind,
        JSON.stringify(c.action),
        c.summary,
        c.approverWaId,
        c.status,
        c.createdAt,
        c.expiresAt,
      ]
    );
    this.logger.log(`Persisted checkpoint ${c.id} (${c.kind})`);
    return c;
  }

  async findLatestAwaitingByApprover(approverWaId: string): Promise<Checkpoint | null> {
    const rows = await this.db.query<CheckpointRow>(
      `SELECT * FROM public.hitl_checkpoints
       WHERE approver_wa_id = $1 AND status = 'awaiting'
       ORDER BY created_at DESC LIMIT 1`,
      [approverWaId]
    );
    return rows[0] ? rowToCheckpoint(rows[0]) : null;
  }

  async findById(id: string): Promise<Checkpoint | null> {
    const rows = await this.db.query<CheckpointRow>(
      `SELECT * FROM public.hitl_checkpoints WHERE id = $1`,
      [id]
    );
    return rows[0] ? rowToCheckpoint(rows[0]) : null;
  }

  async updateStatus(id: string, status: Checkpoint["status"]): Promise<void> {
    await this.db.query(`UPDATE public.hitl_checkpoints SET status = $2 WHERE id = $1`, [id, status]);
  }
}

@Injectable()
export class InMemoryCheckpointRepository extends CheckpointRepository {
  private readonly store = new Map<string, Checkpoint>();

  async create(checkpoint: Checkpoint): Promise<Checkpoint> {
    this.store.set(checkpoint.id, checkpoint);
    return checkpoint;
  }

  async findLatestAwaitingByApprover(approverWaId: string): Promise<Checkpoint | null> {
    const matches = [...this.store.values()]
      .filter((c) => c.approverWaId === approverWaId && c.status === "awaiting")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return matches[0] ?? null;
  }

  async findById(id: string): Promise<Checkpoint | null> {
    return this.store.get(id) ?? null;
  }

  async updateStatus(id: string, status: Checkpoint["status"]): Promise<void> {
    const existing = this.store.get(id);
    if (existing) this.store.set(id, { ...existing, status });
  }
}
