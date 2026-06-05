import type {
  Agent,
  Automation,
  Campaign,
  CreditWindow,
  Deployment,
  FilingObligation,
  FinanceSnapshot,
  HitlCheckpoint,
  Integration,
  Tenant,
} from "./types";

/**
 * Static fixtures used by the scaffolded UI.
 * In production these are replaced by typed calls to the NestJS BFF.
 */

export const MOCK_TENANTS: Tenant[] = [
  // Dummy MAX-ACCESS tenant: Scale tier, every module on.
  {
    id: "t_acme",
    name: "Acme Retail",
    slug: "acme",
    autonomy: "FULLY_AUTONOMOUS",
    status: "active",
    activeAgents: 4,
    monthlySpendEur: 1840,
    marginPct: 62,
    entitlements: { tier: "scale", overrides: {} },
  },
  // Growth tier: acquisition + automations + deployments (no finances).
  {
    id: "t_lumen",
    name: "Lumen Health",
    slug: "lumen",
    autonomy: "APPROVAL_REQUIRED",
    status: "pending",
    activeAgents: 3,
    monthlySpendEur: 920,
    marginPct: 58,
    entitlements: { tier: "growth", overrides: {} },
  },
  // Growth tier but finances force-enabled as a one-off override.
  {
    id: "t_north",
    name: "Northwind SaaS",
    slug: "northwind",
    autonomy: "FULLY_AUTONOMOUS",
    status: "active",
    activeAgents: 5,
    monthlySpendEur: 3120,
    marginPct: 67,
    entitlements: { tier: "growth", overrides: { finances: true } },
  },
  // Restricted demo: Starter tier → acquisition + account only.
  {
    id: "t_vela",
    name: "Vela Studio",
    slug: "vela",
    autonomy: "PAUSED",
    status: "idle",
    activeAgents: 0,
    monthlySpendEur: 240,
    marginPct: 41,
    entitlements: { tier: "starter", overrides: {} },
  },
  // Growth tier with deployments temporarily suspended via override.
  {
    id: "t_orbit",
    name: "Orbit Fitness",
    slug: "orbit",
    autonomy: "APPROVAL_REQUIRED",
    status: "error",
    activeAgents: 2,
    monthlySpendEur: 610,
    marginPct: 49,
    entitlements: { tier: "growth", overrides: { deployments: false } },
  },
];

export function getTenant(slug: string): Tenant | undefined {
  return MOCK_TENANTS.find((t) => t.slug === slug);
}

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

// ── Customer Acquisition ──────────────────────────────────────────────
export const MOCK_CAMPAIGNS: Campaign[] = [
  { id: "cmp_1", name: "Q3 Awareness — Video", channel: "meta", status: "active", spendEur: 640, cpaEur: 12.4, conversions: 52 },
  { id: "cmp_2", name: "Branded Search", channel: "google", status: "active", spendEur: 410, cpaEur: 8.1, conversions: 50 },
  { id: "cmp_3", name: "Creator Seeding", channel: "tiktok", status: "pending", spendEur: 220, cpaEur: 18.9, conversions: 12 },
  { id: "cmp_4", name: "Reactivation", channel: "email", status: "idle", spendEur: 0, cpaEur: 0, conversions: 0 },
];

// ── Deployments ───────────────────────────────────────────────────────
export const MOCK_DEPLOYMENTS: Deployment[] = [
  { id: "dep_1", environment: "production", branch: "main", commit: "a1b2c3d", status: "active", deployedAt: "2026-06-05T11:02:00Z", actor: "ci-bot" },
  { id: "dep_2", environment: "staging", branch: "feat/checkout-v2", commit: "9f8e7d6", status: "info", deployedAt: "2026-06-05T12:40:00Z", actor: "max@acme" },
  { id: "dep_3", environment: "production", branch: "main", commit: "5c4b3a2", status: "error", deployedAt: "2026-06-04T18:20:00Z", actor: "ci-bot" },
];

// ── Finances ──────────────────────────────────────────────────────────
export const MOCK_FINANCE: FinanceSnapshot = {
  cashEur: 184000,
  mrrEur: 32400,
  burnEur: 21800,
  runwayMonths: 8.4,
};

export const MOCK_FILINGS: FilingObligation[] = [
  { id: "f_1", name: "VAT Return (Bi-monthly)", authority: "Revenue (IE)", dueDate: "2026-06-19", status: "due_soon" },
  { id: "f_2", name: "Corporation Tax (CT1)", authority: "Revenue (IE)", dueDate: "2026-09-23", status: "upcoming" },
  { id: "f_3", name: "Employer PAYE", authority: "Revenue (IE)", dueDate: "2026-06-14", status: "overdue" },
  { id: "f_4", name: "Annual Return (B1)", authority: "CRO (IE)", dueDate: "2026-05-30", status: "filed" },
];

// ── Automations ───────────────────────────────────────────────────────
export const MOCK_AUTOMATIONS: Automation[] = [
  { id: "au_1", name: "Lead → CRM enrichment", trigger: "Webhook: new lead", status: "active", workflowId: "wf_lead_enrich", runsToday: 38 },
  { id: "au_2", name: "Daily revenue digest", trigger: "Schedule: 08:00", status: "active", workflowId: "wf_rev_digest", runsToday: 1 },
  { id: "au_3", name: "Churn-risk WhatsApp ping", trigger: "Event: usage drop", status: "pending", workflowId: "wf_churn_ping", runsToday: 0 },
];

// ── Account / integrations ────────────────────────────────────────────
export const MOCK_INTEGRATIONS: Integration[] = [
  { id: "in_wa", name: "WhatsApp (Twilio)", category: "messaging", connected: true },
  { id: "in_meta", name: "Meta Ads", category: "ads", connected: true },
  { id: "in_google", name: "Google Ads", category: "ads", connected: false },
  { id: "in_xero", name: "Xero", category: "accounting", connected: false },
  { id: "in_coolify", name: "Coolify", category: "deploy", connected: true },
];
