/** Autonomy posture for a tenant's agents (drives the HITL gate). */
export type AutonomyLevel = "FULLY_AUTONOMOUS" | "APPROVAL_REQUIRED" | "PAUSED";

/** Per-tenant operational settings (who approves, default autonomy). */
export interface WorkspaceSettings {
  tenantId: string;
  /** WhatsApp address that receives HITL approvals, e.g. "whatsapp:+3531234567". */
  approverWaId: string | null;
  defaultAutonomy: AutonomyLevel;
}
