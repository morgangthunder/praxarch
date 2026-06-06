import type { ContentPublishPayload } from "../marketing/contracts";

/** What to execute when a checkpoint is approved. */
export type CheckpointAction =
  /** Resume a parked n8n execution (the original Brain ↔ human flow). */
  | { type: "n8n" }
  /** Trigger a production promote via the CI/CD service. */
  | { type: "deploy"; deploy: DeployActionPayload }
  /** Publish approved marketing content via the Marketing OS. */
  | { type: "publish"; publish: ContentPublishPayload };

export interface DeployActionPayload {
  project: string;
  environment: "staging" | "production";
  ref?: string;
  serviceId?: string;
}

/** A parked, resumable agent decision awaiting human approval over WhatsApp. */
export interface Checkpoint {
  id: string;
  tenantId: string;
  /** n8n execution that is paused at a Wait node, keyed for resumption (n8n actions only). */
  executionId?: string;
  /** Opaque token n8n issued for its resume webhook (defense-in-depth). */
  resumeToken?: string;
  kind: "content_publish" | "budget_change" | "alert" | "deploy_promote";
  /** What runs on approval. Defaults to resuming n8n. */
  action: CheckpointAction;
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
