import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../common/database/database.service";
import { CapabilitySource } from "./capability.types";

export interface AuditEntry {
  tenantId: string;
  capabilityId: string;
  source: CapabilitySource;
  actor: string;
  status: string;
  credits: number;
  input: unknown;
  result: unknown;
}

/**
 * Append-only ledger of every capability dispatch. Doubles as the credit-usage
 * record for now (a dedicated Credit Engine can read from it later). Best-effort:
 * never fails the actual action if persistence is unavailable.
 */
@Injectable()
export class CapabilityAuditService {
  private readonly logger = new Logger(CapabilityAuditService.name);

  constructor(private readonly db: DatabaseService) {}

  async record(entry: AuditEntry): Promise<void> {
    this.logger.log(
      `[audit] ${entry.tenantId} ${entry.capabilityId} via ${entry.source} -> ${entry.status} (${entry.credits} cr)`
    );
    if (!this.db.enabled) return;
    try {
      await this.db.query(
        `INSERT INTO public.capability_audit
           (id, tenant_id, capability_id, source, actor, status, credits, input, result, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())`,
        [
          randomUUID(),
          entry.tenantId,
          entry.capabilityId,
          entry.source,
          entry.actor,
          entry.status,
          entry.credits,
          JSON.stringify(entry.input ?? null),
          JSON.stringify(entry.result ?? null),
        ]
      );
    } catch (err) {
      this.logger.warn(`Audit write failed: ${(err as Error).message}`);
    }
  }
}
