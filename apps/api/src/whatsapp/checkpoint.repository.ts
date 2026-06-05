import { Injectable } from "@nestjs/common";
import { Checkpoint } from "./checkpoint.types";

/**
 * Persistence boundary for checkpoints.
 *
 * Production implementation writes to the tenant's Postgres schema
 * (`tenant_<id>.hitl_checkpoints`). The in-memory version below keeps the
 * scaffolding runnable and documents the contract.
 */
export abstract class CheckpointRepository {
  abstract create(checkpoint: Checkpoint): Promise<Checkpoint>;
  /** Look up by the approver's phone — the only key an inbound SMS gives us. */
  abstract findLatestAwaitingByApprover(approverWaId: string): Promise<Checkpoint | null>;
  abstract findById(id: string): Promise<Checkpoint | null>;
  abstract updateStatus(id: string, status: Checkpoint["status"]): Promise<void>;
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
