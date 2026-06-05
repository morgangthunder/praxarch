/**
 * Shared UI domain types.
 * These mirror the API contracts exposed by the NestJS BFF.
 */

export type AutonomyLevel = "FULLY_AUTONOMOUS" | "APPROVAL_REQUIRED" | "PAUSED";

export type AgentStatus = "active" | "pending" | "error" | "idle" | "info";

export type AgentRole = "strategist" | "creative" | "analyst" | "buyer";

export interface Agent {
  id: string;
  role: AgentRole;
  name: string;
  status: AgentStatus;
  /** Short human-readable current activity. */
  activity: string;
  /** Credits consumed in the current billing window. */
  creditsUsed: number;
}

export interface Tenant {
  id: string;
  name: string;
  /** Subdomain / slug used for white-label routing. */
  slug: string;
  autonomy: AutonomyLevel;
  status: AgentStatus;
  activeAgents: number;
  monthlySpendEur: number;
  /** Live margin = revenue charged − provider cost. */
  marginPct: number;
}

export interface CreditWindow {
  /** Credits charged to the customer this window. */
  charged: number;
  /** Underlying provider cost (LLM tokens + API €). */
  cost: number;
  /** Credits remaining in the prepaid balance. */
  balance: number;
  /** Window label, e.g. "June 2026". */
  period: string;
}

export interface HitlCheckpoint {
  id: string;
  tenantId: string;
  tenantName: string;
  /** What the agent wants to do. */
  summary: string;
  kind: "content_publish" | "budget_change" | "alert";
  createdAt: string;
}
