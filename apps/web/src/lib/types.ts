/**
 * Shared UI domain types.
 * These mirror the API contracts exposed by the NestJS BFF.
 */

import type { ModuleKey, TenantEntitlements } from "./modules";

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
  /** Subscription tier + per-module access overrides. */
  entitlements: TenantEntitlements;
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

// ── Customer Acquisition module ───────────────────────────────────────
/** An AI-generated content item moving through the publish pipeline. */
export interface ContentDraft {
  id: string;
  channel: "meta" | "google" | "tiktok" | "linkedin" | "email";
  title: string;
  body: string;
  /** draft → awaiting (HITL) → scheduled/published, or rejected. */
  status: "draft" | "awaiting" | "scheduled" | "published" | "rejected";
  createdAt: string;
}

export interface FunnelStage {
  label: string;
  count: number;
}

/**
 * Pre-CRM marketing lead (Customer Acquisition funnel).
 * Once identified, syncs to a CrmContact — attribution rides along for closed-loop reporting.
 */
export interface Lead {
  id: string;
  name: string;
  source: Campaign["channel"];
  valueEur: number;
  status: "new" | "qualified" | "won" | "lost";
  /** Populated after the lead is promoted to a CRM contact. */
  contactId?: string;
}

// ── CRM module (Contacts + Pipeline) ────────────────────────────────────
/** How a contact entered the tenant's CRM. `ad:*` = synced from Acquisition. */
export type CrmContactSource =
  | "ad:meta"
  | "ad:google"
  | "ad:tiktok"
  | "ad:linkedin"
  | "ad:email"
  | "manual"
  | "import";

/** First-touch attribution captured by the Praxarch SDK / ad click IDs (CA §9.1). */
export interface CrmAttribution {
  gclid?: string;
  fbclid?: string;
  utmSource?: string;
  utmCampaign?: string;
  firstTouchAt?: string;
}

export interface CrmContact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  tags: string[];
  customFields: Record<string, string>;
  source: CrmContactSource;
  attribution?: CrmAttribution;
  /** Links back to the Acquisition lead that created this contact. */
  leadId?: string;
  createdAt: string;
}

export type CrmOpportunityStage = "new" | "qualified" | "proposal" | "won" | "lost";

export interface CrmOpportunity {
  id: string;
  contactId: string;
  title: string;
  dealValueCents: number;
  currency: string;
  stage: CrmOpportunityStage;
  expectedCloseDate?: string;
  stageChangedAt: string;
  notes?: string;
}

export interface CrmPipelineStage {
  id: CrmOpportunityStage;
  label: string;
}

export interface Campaign {
  id: string;
  name: string;
  channel: "meta" | "google" | "tiktok" | "linkedin" | "email";
  status: AgentStatus;
  spendEur: number;
  /** Cost per acquisition. */
  cpaEur: number;
  conversions: number;
}

// ── Deployments module ────────────────────────────────────────────────
export interface Deployment {
  id: string;
  environment: "production" | "staging";
  branch: string;
  commit: string;
  status: AgentStatus;
  deployedAt: string;
  actor: string;
}

export type DeployEnvironment = "production" | "staging";

/** The state of one environment of a deployable service. */
export interface ServiceEnvironment {
  environment: DeployEnvironment;
  branch: string;
  commit: string;
  version: string;
  status: AgentStatus;
  deployedAt: string;
  /** Set when staging is ahead of production (a promote is available). */
  aheadOfProd?: boolean;
}

/** A deployable unit within a tenant — an app or a backing service. */
export interface DeployService {
  id: string;
  name: string;
  repo: string;
  kind: "app" | "service";
  environments: ServiceEnvironment[];
}

// ── Finances module ───────────────────────────────────────────────────
export interface FilingObligation {
  id: string;
  name: string;
  authority: string;
  dueDate: string;
  status: "upcoming" | "due_soon" | "overdue" | "filed";
}

export interface FinanceSnapshot {
  cashEur: number;
  mrrEur: number;
  burnEur: number;
  runwayMonths: number;
}

// ── Automations module ────────────────────────────────────────────────
export interface Automation {
  id: string;
  name: string;
  trigger: string;
  status: AgentStatus;
  /** Linked n8n workflow id. */
  workflowId: string;
  runsToday: number;
}

// ── Account: ad budget, team, spend ───────────────────────────────────
/** Prepaid ad-budget pool. We fund platforms from the pool and mark up. */
export interface AdBudget {
  /** Available pool balance (already topped up) in EUR. */
  poolEur: number;
  /** Spent from the pool this window. */
  spentEur: number;
  /** Platform-fee markup applied to spend (our margin). */
  markupPct: number;
  period: string;
}

export interface AdChannelSpend {
  channel: Campaign["channel"];
  spendEur: number;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "owner" | "member" | "viewer";
  status: "active" | "invited";
}

/** LLM spend attributed to a module (per the round-2 decision: group by module). */
export interface ModuleSpend {
  label: string;
  eur: number;
  pct: number;
}

// ── Account / integrations ────────────────────────────────────────────
export interface Integration {
  id: string;
  name: string;
  category: "messaging" | "ads" | "accounting" | "deploy";
  connected: boolean;
}

// ── Credits: tier allowance + top-ups (tenant-facing view) ────────────
export interface CreditAllowance {
  period: string;
  /** Credits included by the tenant's plan tier this window. */
  includedAllowance: number;
  /** Credits consumed this window. */
  used: number;
  /** Remaining purchased top-up credits (roll-over). */
  topUpRemaining: number;
}

// ── Overview: cross-module pending actions ────────────────────────────
export interface PendingAction {
  id: string;
  kind: "approval" | "filing" | "deploy" | "credit";
  label: string;
  detail: string;
  /** Module this action routes to. */
  module: ModuleKey;
  severity: AgentStatus;
}
