/** A parked, resumable agent decision awaiting human approval over WhatsApp. */
export interface Checkpoint {
  id: string;
  tenantId: string;
  /** n8n execution that is paused at a Wait node, keyed for resumption. */
  executionId: string;
  /** Opaque token n8n issued for its resume webhook (defense-in-depth). */
  resumeToken: string;
  kind: "content_publish" | "budget_change" | "alert";
  /** Human-facing summary sent over WhatsApp. */
  summary: string;
  /** The approver's WhatsApp address, e.g. "whatsapp:+3531234567". */
  approverWaId: string;
  status: "awaiting" | "approved" | "rejected" | "expired";
  createdAt: string;
  expiresAt: string;
}

export type CheckpointDecision =
  | { action: "approve" }
  | { action: "reject" }
  | { action: "edit"; instructions: string };
