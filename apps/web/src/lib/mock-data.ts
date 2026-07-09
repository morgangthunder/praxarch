import type {
  AdBudget,
  AdChannelSpend,
  Agent,
  Automation,
  Campaign,
  ContentDraft,
  CreditWindow,
  Deployment,
  DeployService,
  FilingObligation,
  FinanceSnapshot,
  CrmContact,
  CrmOpportunity,
  CrmOpportunityStage,
  CrmPipelineStage,
  FunnelStage,
  HitlCheckpoint,
  Integration,
  Lead,
  ModuleSpend,
  PendingAction,
  Tenant,
  TeamMember,
} from "./types";
import { hasModuleAccess } from "./modules";

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
  // Real client workspace: Growth tier with Deployments; starts with no services.
  {
    id: "t_bubblbook",
    name: "Bubblbook",
    slug: "bubblbook",
    autonomy: "APPROVAL_REQUIRED",
    status: "active",
    activeAgents: 0,
    monthlySpendEur: 0,
    marginPct: 0,
    entitlements: { tier: "growth", overrides: {} },
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
// Ad spend is per-tenant: each campaign set is derived from the tenant's own
// monthly ad budget so no two tenants share numbers. (In production this comes
// from the tenant-scoped ads API via the BFF.)
const CAMPAIGN_TEMPLATE: Array<{
  name: string;
  channel: Campaign["channel"];
  weight: number;
  cpaEur: number;
  status: Campaign["status"];
}> = [
  { name: "Q3 Awareness — Video", channel: "meta", weight: 0.42, cpaEur: 12.4, status: "active" },
  { name: "Branded Search", channel: "google", weight: 0.28, cpaEur: 8.1, status: "active" },
  { name: "Creator Seeding", channel: "tiktok", weight: 0.2, cpaEur: 18.9, status: "pending" },
  { name: "Reactivation", channel: "email", weight: 0.1, cpaEur: 5.2, status: "active" },
];

/** Tenant-scoped campaigns. Spend distributes the tenant's monthly ad budget. */
export function getCampaigns(tenant: Tenant): Campaign[] {
  const budget = tenant.monthlySpendEur;
  return CAMPAIGN_TEMPLATE.map((t, i) => {
    const spendEur = Math.round(budget * t.weight);
    const status: Campaign["status"] = spendEur === 0 ? "idle" : t.status;
    const conversions = spendEur > 0 && t.cpaEur > 0 ? Math.round(spendEur / t.cpaEur) : 0;
    return {
      id: `${tenant.slug}_cmp_${i + 1}`,
      name: t.name,
      channel: t.channel,
      status,
      spendEur,
      cpaEur: t.cpaEur,
      conversions,
    };
  });
}

/** Total ad spend for a tenant this window (sum of campaign spend). */
export function getAdSpend(tenant: Tenant): number {
  return getCampaigns(tenant).reduce((sum, c) => sum + c.spendEur, 0);
}

/** Assumed average order value used to estimate revenue / ROAS in the demo. */
export const ASSUMED_AOV_EUR = 64;

/** AI-generated content pipeline for a tenant (demo). */
export function getContentDrafts(tenant: Tenant): ContentDraft[] {
  // Autonomous tenants show published/scheduled; approval-required show a queue.
  const autonomous = tenant.autonomy === "FULLY_AUTONOMOUS";
  return [
    {
      id: `${tenant.slug}_ct1`,
      channel: "meta",
      title: "Summer launch — carousel",
      body: "Meet the new collection. Tap to shop the drop before it's gone. ☀️",
      status: autonomous ? "published" : "awaiting",
      createdAt: "2026-06-05T09:10:00Z",
    },
    {
      id: `${tenant.slug}_ct2`,
      channel: "tiktok",
      title: "Creator hook — 15s",
      body: "POV: you found the only thing you need this summer.",
      status: autonomous ? "scheduled" : "awaiting",
      createdAt: "2026-06-05T10:02:00Z",
    },
    {
      id: `${tenant.slug}_ct3`,
      channel: "email",
      title: "Reactivation — win-back",
      body: "We saved your cart. Here's 10% to finish checkout.",
      status: "draft",
      createdAt: "2026-06-05T11:40:00Z",
    },
  ];
}

/** Acquisition funnel for a tenant (scaled to its conversions). */
export function getFunnel(tenant: Tenant): FunnelStage[] {
  const conversions = getCampaigns(tenant).reduce((s, c) => s + c.conversions, 0);
  const leads = Math.max(conversions * 6, 12);
  const qualified = Math.round(leads * 0.45);
  return [
    { label: "Leads", count: leads },
    { label: "Qualified", count: qualified },
    { label: "Conversions", count: conversions },
  ];
}

/** Tenant-scoped acquisition leads. Each identified lead maps to a CRM contact. */
export function getLeads(tenant: Tenant): Lead[] {
  const contacts = getCrmContacts(tenant);
  const fromAds = contacts.filter((c) => c.leadId);
  return fromAds.map((c) => {
    const channel = c.source.replace("ad:", "") as Lead["source"];
    const opp = getCrmOpportunities(tenant).find((o) => o.contactId === c.id);
    const status: Lead["status"] =
      opp?.stage === "won" ? "won" : opp?.stage === "lost" ? "lost" : opp?.stage === "qualified" || opp?.stage === "proposal" ? "qualified" : "new";
    return {
      id: c.leadId!,
      name: c.name,
      source: channel,
      valueEur: opp ? Math.round(opp.dealValueCents / 100) : 0,
      status,
      contactId: c.id,
    };
  });
}

// ── CRM (Contacts + Pipeline) ─────────────────────────────────────────
/** Default pipeline ladder. Per-tenant rename/reorder comes later via `crm_stages`. */
export const CRM_PIPELINE_STAGES: CrmPipelineStage[] = [
  { id: "new", label: "New" },
  { id: "qualified", label: "Qualified" },
  { id: "proposal", label: "Proposal" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

const CRM_BY_TENANT: Record<string, { contacts: CrmContact[]; opportunities: CrmOpportunity[] }> = {
  acme: {
    contacts: [
      {
        id: "ct_acme_1",
        name: "R. Okafor",
        email: "r.okafor@example.com",
        company: "Okafor Retail",
        tags: ["pilot", "meta"],
        customFields: { industry: "Retail" },
        source: "ad:meta",
        leadId: "ld_1",
        attribution: { fbclid: "IwAR…", utmSource: "meta", utmCampaign: "q3-awareness", firstTouchAt: "2026-06-01T10:00:00Z" },
        createdAt: "2026-06-01T10:05:00Z",
      },
      {
        id: "ct_acme_2",
        name: "T. Nguyen",
        email: "t.nguyen@example.com",
        company: "Nguyen Labs",
        tags: ["google", "subscription"],
        customFields: { plan: "Growth" },
        source: "ad:google",
        leadId: "ld_2",
        attribution: { gclid: "CjwK…", utmSource: "google", utmCampaign: "branded-search", firstTouchAt: "2026-05-28T14:20:00Z" },
        createdAt: "2026-05-28T14:22:00Z",
      },
      {
        id: "ct_acme_3",
        name: "S. Patel",
        email: "s.patel@example.com",
        tags: ["tiktok"],
        customFields: {},
        source: "ad:tiktok",
        leadId: "ld_3",
        attribution: { utmSource: "tiktok", utmCampaign: "creator-seeding", firstTouchAt: "2026-06-04T09:00:00Z" },
        createdAt: "2026-06-04T09:10:00Z",
      },
      {
        id: "ct_acme_4",
        name: "M. Rossi",
        email: "m.rossi@example.com",
        company: "Rossi & Co",
        tags: ["email", "win-back"],
        customFields: { ltv_segment: "high" },
        source: "ad:email",
        leadId: "ld_4",
        createdAt: "2026-06-02T11:00:00Z",
      },
      {
        id: "ct_acme_5",
        name: "K. Schmidt",
        email: "k.schmidt@example.com",
        tags: ["meta", "churn-risk"],
        customFields: {},
        source: "ad:meta",
        leadId: "ld_5",
        createdAt: "2026-05-20T16:00:00Z",
      },
      {
        id: "ct_acme_6",
        name: "Elena Vasquez",
        email: "elena@northwind.io",
        company: "Northwind Referral",
        tags: ["referral", "manual"],
        customFields: { referred_by: "Partner program" },
        source: "manual",
        createdAt: "2026-06-03T08:00:00Z",
      },
    ],
    opportunities: [
      { id: "opp_1", contactId: "ct_acme_1", title: "Okafor — Q3 rollout", dealValueCents: 24000, currency: "EUR", stage: "qualified", expectedCloseDate: "2026-06-20", stageChangedAt: "2026-06-05T08:00:00Z" },
      { id: "opp_2", contactId: "ct_acme_2", title: "Nguyen Labs subscription", dealValueCents: 9000, currency: "EUR", stage: "won", expectedCloseDate: "2026-06-01", stageChangedAt: "2026-06-01T12:00:00Z", notes: "Closed — fires Meta CAPI + Google offline conversion." },
      { id: "opp_3", contactId: "ct_acme_3", title: "Patel pilot", dealValueCents: 6000, currency: "EUR", stage: "new", expectedCloseDate: "2026-06-30", stageChangedAt: "2026-06-04T09:15:00Z" },
      { id: "opp_4", contactId: "ct_acme_4", title: "Rossi enterprise", dealValueCents: 32000, currency: "EUR", stage: "proposal", expectedCloseDate: "2026-06-15", stageChangedAt: "2026-06-04T14:00:00Z" },
      { id: "opp_5", contactId: "ct_acme_5", title: "Schmidt reactivation", dealValueCents: 0, currency: "EUR", stage: "lost", stageChangedAt: "2026-05-25T10:00:00Z" },
      { id: "opp_6", contactId: "ct_acme_6", title: "Vasquez partner deal", dealValueCents: 15000, currency: "EUR", stage: "new", expectedCloseDate: "2026-07-01", stageChangedAt: "2026-06-03T08:30:00Z" },
    ],
  },
};

function defaultCrmForTenant(tenant: Tenant): { contacts: CrmContact[]; opportunities: CrmOpportunity[] } {
  const scaled = Math.max(tenant.monthlySpendEur / 1000, 1);
  return {
    contacts: [
      {
        id: `${tenant.slug}_ct_1`,
        name: "Inbound lead",
        email: `lead@${tenant.slug}.example`,
        tags: ["meta"],
        customFields: {},
        source: "ad:meta",
        leadId: `${tenant.slug}_ld_1`,
        attribution: { utmSource: "meta", utmCampaign: "awareness", firstTouchAt: "2026-06-01T10:00:00Z" },
        createdAt: "2026-06-01T10:05:00Z",
      },
    ],
    opportunities: [
      {
        id: `${tenant.slug}_opp_1`,
        contactId: `${tenant.slug}_ct_1`,
        title: "Starter deal",
        dealValueCents: Math.round(scaled * 12000),
        currency: "EUR",
        stage: "qualified",
        expectedCloseDate: "2026-06-25",
        stageChangedAt: "2026-06-02T09:00:00Z",
      },
    ],
  };
}

export function getCrmContacts(tenant: Tenant): CrmContact[] {
  return (CRM_BY_TENANT[tenant.slug] ?? defaultCrmForTenant(tenant)).contacts;
}

export function getCrmOpportunities(tenant: Tenant): CrmOpportunity[] {
  return (CRM_BY_TENANT[tenant.slug] ?? defaultCrmForTenant(tenant)).opportunities;
}

/** Open pipeline value (excludes won/lost). */
export function getCrmPipelineValueEur(tenant: Tenant): number {
  return getCrmOpportunities(tenant)
    .filter((o) => o.stage !== "won" && o.stage !== "lost")
    .reduce((sum, o) => sum + o.dealValueCents, 0) / 100;
}

// ── Deployments ───────────────────────────────────────────────────────
// A tenant can have 1 app, 2 apps, or many backing services. Each service has
// its own environments (production + staging). Per-tenant fixtures below.
const SERVICES_BY_TENANT: Record<string, DeployService[]> = {
  acme: [
    {
      id: "storefront",
      name: "Storefront",
      repo: "acme/storefront",
      kind: "app",
      environments: [
        { environment: "production", branch: "main", commit: "a1b2c3d", version: "v2.4.1", status: "active", deployedAt: "2026-06-05T11:02:00Z" },
        { environment: "staging", branch: "feat/checkout-v2", commit: "9f8e7d6", version: "v2.5.0-rc1", status: "info", deployedAt: "2026-06-05T12:40:00Z", aheadOfProd: true },
      ],
    },
    {
      id: "api",
      name: "API Gateway",
      repo: "acme/api",
      kind: "service",
      environments: [
        { environment: "production", branch: "main", commit: "5c4b3a2", version: "v1.9.3", status: "active", deployedAt: "2026-06-04T18:20:00Z" },
        { environment: "staging", branch: "main", commit: "5c4b3a2", version: "v1.9.3", status: "active", deployedAt: "2026-06-04T18:20:00Z" },
      ],
    },
    {
      id: "worker",
      name: "Fulfilment Worker",
      repo: "acme/worker",
      kind: "service",
      environments: [
        { environment: "production", branch: "main", commit: "7d6e5f4", version: "v0.8.0", status: "error", deployedAt: "2026-06-04T18:20:00Z" },
        { environment: "staging", branch: "fix/retry-queue", commit: "c0ffee1", version: "v0.8.1-rc2", status: "active", deployedAt: "2026-06-05T09:15:00Z", aheadOfProd: true },
      ],
    },
  ],
  lumen: [
    {
      id: "portal",
      name: "Patient Portal",
      repo: "lumen/portal",
      kind: "app",
      environments: [
        { environment: "production", branch: "main", commit: "11aa22b", version: "v3.1.0", status: "active", deployedAt: "2026-06-03T10:00:00Z" },
        { environment: "staging", branch: "main", commit: "11aa22b", version: "v3.1.0", status: "active", deployedAt: "2026-06-03T10:00:00Z" },
      ],
    },
  ],
  bubblbook: [],
  northwind: [
    {
      id: "marketing",
      name: "Marketing Site",
      repo: "northwind/www",
      kind: "app",
      environments: [
        { environment: "production", branch: "main", commit: "ab12cd3", version: "v5.0.2", status: "active", deployedAt: "2026-06-05T08:00:00Z" },
        { environment: "staging", branch: "feat/pricing", commit: "ef45gh6", version: "v5.1.0-rc1", status: "info", deployedAt: "2026-06-05T13:10:00Z", aheadOfProd: true },
      ],
    },
    {
      id: "api",
      name: "Core API",
      repo: "northwind/api",
      kind: "service",
      environments: [
        { environment: "production", branch: "main", commit: "99zz88y", version: "v4.2.7", status: "active", deployedAt: "2026-06-02T16:30:00Z" },
        { environment: "staging", branch: "main", commit: "99zz88y", version: "v4.2.7", status: "active", deployedAt: "2026-06-02T16:30:00Z" },
      ],
    },
  ],
};

const DEFAULT_SERVICES: DeployService[] = [
  {
    id: "web",
    name: "Web App",
    repo: "tenant/web",
    kind: "app",
    environments: [
      { environment: "production", branch: "main", commit: "0000aaa", version: "v1.0.0", status: "active", deployedAt: "2026-06-01T09:00:00Z" },
      { environment: "staging", branch: "main", commit: "0000aaa", version: "v1.0.0", status: "active", deployedAt: "2026-06-01T09:00:00Z" },
    ],
  },
];

/** Deployable services for a tenant (apps + backing services). */
export function getServices(tenant: Tenant): DeployService[] {
  return SERVICES_BY_TENANT[tenant.slug] ?? DEFAULT_SERVICES;
}

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

// ── Credits allowance (tenant-facing) ─────────────────────────────────
/** Credits consumed this window (demo). Compared against the tier allowance. */
export const MOCK_CREDITS_USED = 12_480;
export const MOCK_TOPUP_REMAINING = 5_000;

// ── Ad budget (second meter — prepaid pool, separate from credits) ─────
/** Prepaid ad-budget pool per tenant. Spent is derived from campaigns. */
export function getAdBudget(tenant: Tenant): AdBudget {
  const spentEur = getAdSpend(tenant);
  // Demo: tenants keep a pool ~1.6× their monthly spend.
  const poolEur = Math.round(spentEur * 1.6);
  return { poolEur, spentEur, markupPct: 12, period: "June 2026" };
}

/** Spend split by channel (for the ad-budget breakdown). */
export function getAdChannelSpend(tenant: Tenant): AdChannelSpend[] {
  return getCampaigns(tenant)
    .filter((c) => c.spendEur > 0)
    .map((c) => ({ channel: c.channel, spendEur: c.spendEur }));
}

/** Ad-budget top-up packs (EUR pool credit). */
export const AD_TOPUP_PACKS = [
  { id: "ad_250", amountEur: 250, priceEur: 250 },
  { id: "ad_1000", amountEur: 1000, priceEur: 1000 },
  { id: "ad_5000", amountEur: 5000, priceEur: 5000 },
];

// ── Team & roles (tenant-facing) ──────────────────────────────────────
export const MOCK_TEAM: TeamMember[] = [
  { id: "u_owner", name: "Maya Owner", email: "maya@acme.com", role: "owner", status: "active" },
  { id: "u_member", name: "Sam Member", email: "sam@acme.com", role: "member", status: "active" },
  { id: "u_viewer", name: "Vic Viewer", email: "vic@acme.com", role: "viewer", status: "active" },
  { id: "u_invite", name: "—", email: "newhire@acme.com", role: "member", status: "invited" },
];

// ── LLM spend by module (round-2 decision: group by module) ───────────
export const MOCK_LLM_BY_MODULE: ModuleSpend[] = [
  { label: "Customer Acquisition", eur: 41.2, pct: 60 },
  { label: "Automations", eur: 13.6, pct: 20 },
  { label: "Deployments", eur: 6.2, pct: 9 },
  { label: "Finances", eur: 7.7, pct: 11 },
];

/**
 * Cross-module "needs your attention" feed for the Overview.
 * Only surfaces actions for modules the tenant is actually entitled to.
 */
export function getPendingActions(tenant: Tenant): PendingAction[] {
  const ent = tenant.entitlements;
  const actions: PendingAction[] = [];

  // Approvals (HITL) — only when the tenant runs in approval mode.
  if (tenant.autonomy === "APPROVAL_REQUIRED" && hasModuleAccess(ent, "acquisition")) {
    actions.push({
      id: "pa_approval",
      kind: "approval",
      label: "Content awaiting approval",
      detail: "3 Instagram posts drafted by the Creative agent.",
      module: "acquisition",
      severity: "pending",
    });
  }

  // Overdue filing — only if Finances is entitled.
  if (hasModuleAccess(ent, "finances")) {
    const overdue = MOCK_FILINGS.find((f) => f.status === "overdue");
    if (overdue) {
      actions.push({
        id: "pa_filing",
        kind: "filing",
        label: `${overdue.name} overdue`,
        detail: `${overdue.authority} · was due ${overdue.dueDate}.`,
        module: "finances",
        severity: "error",
      });
    }
  }

  // Failed deployment — only if Deployments is entitled.
  if (hasModuleAccess(ent, "deployments")) {
    const failed = MOCK_DEPLOYMENTS.find((d) => d.status === "error");
    if (failed) {
      actions.push({
        id: "pa_deploy",
        kind: "deploy",
        label: "Production deploy failed",
        detail: `${failed.branch}@${failed.commit} — needs a re-run.`,
        module: "deployments",
        severity: "error",
      });
    }
  }

  // Low credit warning (always relevant; Account is always-on).
  actions.push({
    id: "pa_credit",
    kind: "credit",
    label: "Credit allowance 62% used",
    detail: "At current pace you'll exhaust the monthly allowance in ~9 days.",
    module: "account",
    severity: "info",
  });

  return actions;
}
