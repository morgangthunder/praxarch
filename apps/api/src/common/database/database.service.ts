import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool, type QueryResultRow } from "pg";

/**
 * Thin Postgres access layer (node-postgres Pool).
 *
 * Prototype note: persistence currently keys rows by a TEXT `tenant_id` in the
 * `public` schema. The documented target is schema-per-tenant (`tenant_<id>`)
 * with RLS; `query` is the single choke point where a `SET search_path` would go.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>("DATABASE_URL");
    if (!url) {
      this.logger.warn("DATABASE_URL not set — persistence disabled (in-memory fallbacks).");
      return;
    }
    this.pool = new Pool({ connectionString: url, max: 10 });
    this.logger.log("Postgres pool initialised.");
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  get enabled(): boolean {
    return this.pool !== null;
  }

  /** Run a parameterised query and return the rows. */
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = []
  ): Promise<T[]> {
    if (!this.pool) throw new Error("Database not configured");
    const res = await this.pool.query<T>(text, params as never[]);
    return res.rows;
  }
}
