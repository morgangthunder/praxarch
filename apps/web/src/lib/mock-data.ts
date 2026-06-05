import type { Agent, CreditWindow, HitlCheckpoint, Tenant } from "./types";

/**
 * Static fixtures used by the scaffolded UI.
 * In production these are replaced by typed calls to the NestJS BFF.
 */

export const MOCK_TENANTS: Tenant[] = [
  { id: "t_acme", name: "Acme Retail", slug: "acme", autonomy: "FULLY_AUTONOMOUS", status: "active", activeAgents: 4, monthlySpendEur: 1840, marginPct: 62 },
  { id: "t_lumen", name: "Lumen Health", slug: "lumen", autonomy: "APPROVAL_REQUIRED", status: "pending", activeAgents: 3, monthlySpendEur: 920, marginPct: 58 },
  { id: "t_north", name: "Northwind SaaS", slug: "northwind", autonomy: "FULLY_AUTONOMOUS", status: "active", activeAgents: 5, monthlySpendEur: 3120, marginPct: 67 },
  { id: "t_vela", name: "Vela Studio", slug: "vela", autonomy: "PAUSED", status: "idle", activeAgents: 0, monthlySpendEur: 240, marginPct: 41 },
  { id: "t_orbit", name: "Orbit Fitness", slug: "orbit", autonomy: "APPROVAL_REQUIRED", status: "error", activeAgents: 2, monthlySpendEur: 610, marginPct: 49 },
];

export const MOCK_AGENTS: Agent[] = [
  { id: "a_strat", role: "strategist", name: "Strategist", status: "active", activity: "Decomposing Q3 awareness goal", creditsUsed: 1240 },
  { id: "a_crea", role: "creative", name: "Creative", status: "active", activity: "Drafting 6 ad variations", creditsUsed: 3180 },
  { id: "a_anal", role: "analyst", name: "Analyst", status: "info", activity: "Backfilling attribution data", creditsUsed: 740 },
  { id: "a_buyer", role: "buyer", name: "Media Buyer", status: "pending", activity: "Budget +€500 awaiting approval", creditsUsed: 410 },
];

export const MOCK_CREDITS: CreditWindow = {
  charged: 18420,
  cost: 6890,
  balance: 142000,
  period: "June 2026",
};

export const MOCK_CHECKPOINTS: HitlCheckpoint[] = [
  { id: "c_1", tenantId: "t_lumen", tenantName: "Lumen Health", summary: "Publish 3 Instagram posts on diabetes awareness", kind: "content_publish", createdAt: "2026-06-05T09:12:00Z" },
  { id: "c_2", tenantId: "t_orbit", tenantName: "Orbit Fitness", summary: "Increase Meta daily budget €40 → €90", kind: "budget_change", createdAt: "2026-06-05T08:47:00Z" },
];
