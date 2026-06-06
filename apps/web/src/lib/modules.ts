import {
  LayoutGrid,
  Megaphone,
  Rocket,
  Landmark,
  Workflow,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Tenant-facing product modules.
 *
 * Each module is an independently-toggleable surface with its own left-nav
 * entry and route under /app/[tenant]/<path>. Access is governed by the
 * tenant's subscription tier + per-module overrides (see entitlements below).
 *
 * Modules above a tenant's tier can be enabled à la carte (addOnPriceEurMonthly)
 * — modelled as a paid override.
 */
export type ModuleKey =
  | "overview"
  | "acquisition"
  | "crm"
  | "automations"
  | "deployments"
  | "finances"
  | "account";

export type PlanTier = "starter" | "growth" | "scale";

/** Ordered low → high; used for "requires a higher plan" comparisons. */
export const TIER_ORDER: PlanTier[] = ["starter", "growth", "scale"];

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  /** Relative path segment under /app/[tenant]. */
  path: string;
  icon: LucideIcon;
  /** One-line purpose shown in nav tooltips, locked screens, and admin. */
  blurb: string;
  /** Lowest tier that includes this module by default. */
  minTier: PlanTier;
  /** Always entitled regardless of tier (e.g. Overview, Account). */
  alwaysOn?: boolean;
  /** Monthly price to enable à la carte when above the tenant's tier. */
  addOnPriceEurMonthly?: number;
}

export const MODULES: ModuleDef[] = [
  {
    key: "overview",
    label: "Overview",
    path: "overview",
    icon: LayoutGrid,
    blurb: "Cross-module metrics and everything pending your attention.",
    minTier: "starter",
    alwaysOn: true,
  },
  {
    key: "acquisition",
    label: "Customer Acquisition",
    path: "acquisition",
    icon: Megaphone,
    blurb: "AI marketing, ad management, and content creation across channels.",
    minTier: "starter",
  },
  {
    key: "crm",
    label: "CRM",
    path: "crm",
    icon: Users,
    blurb: "Contacts and pipeline — where Acquisition leads land and deals close.",
    minTier: "starter",
  },
  {
    key: "automations",
    label: "Automations",
    path: "automations",
    icon: Workflow,
    blurb: "Build agents and n8n-driven workflows that run your business.",
    minTier: "growth",
    addOnPriceEurMonthly: 99,
  },
  {
    key: "deployments",
    label: "Deployments",
    path: "deployments",
    icon: Rocket,
    blurb: "Promote to production, pick source branches, and configure CI/CD.",
    minTier: "growth",
    addOnPriceEurMonthly: 79,
  },
  {
    key: "finances",
    label: "Finances",
    path: "finances",
    icon: Landmark,
    blurb: "Accounting integration, country-specific filing guidance, and analysis.",
    minTier: "scale",
    addOnPriceEurMonthly: 199,
  },
  {
    key: "account",
    label: "Account",
    path: "account",
    icon: SlidersHorizontal,
    blurb: "Plan, credit usage, LLM spend, and integration settings (WhatsApp, etc.).",
    minTier: "starter",
    alwaysOn: true,
  },
];

export const MODULE_BY_KEY: Record<ModuleKey, ModuleDef> = Object.fromEntries(
  MODULES.map((m) => [m.key, m])
) as Record<ModuleKey, ModuleDef>;

/** Subscription plans: price, included modules (via minTier), and credit allowance. */
export interface PlanDef {
  tier: PlanTier;
  name: string;
  priceEurMonthly: number;
  tagline: string;
  /** Action-credit allowance included each billing window. */
  includedCreditsMonthly: number;
}

export const PLANS: Record<PlanTier, PlanDef> = {
  starter: { tier: "starter", name: "Starter", priceEurMonthly: 149, tagline: "Get acquisition running.", includedCreditsMonthly: 20_000 },
  growth: { tier: "growth", name: "Growth", priceEurMonthly: 399, tagline: "Automate ops & ship faster.", includedCreditsMonthly: 75_000 },
  scale: { tier: "scale", name: "Scale", priceEurMonthly: 899, tagline: "Full financial autonomy.", includedCreditsMonthly: 200_000 },
};

/** À la carte credit top-up packs, purchasable on top of the tier allowance. */
export interface TopUpPack {
  id: string;
  credits: number;
  priceEur: number;
}

export const TOPUP_PACKS: TopUpPack[] = [
  { id: "tu_10", credits: 10_000, priceEur: 49 },
  { id: "tu_50", credits: 50_000, priceEur: 199 },
  { id: "tu_200", credits: 200_000, priceEur: 699 },
];

/**
 * What a tenant is entitled to: a base tier, plus explicit per-module overrides
 * that the super-admin (or an à la carte purchase) can flip on/off.
 */
export interface TenantEntitlements {
  tier: PlanTier;
  /** true = force-enabled (à la carte if above tier), false = force-disabled. */
  overrides: Partial<Record<ModuleKey, boolean>>;
}

function tierRank(tier: PlanTier): number {
  return TIER_ORDER.indexOf(tier);
}

/** Does this tier include the module by default (ignoring overrides)? */
export function tierIncludes(tier: PlanTier, module: ModuleKey): boolean {
  return tierRank(tier) >= tierRank(MODULE_BY_KEY[module].minTier);
}

/** Effective access for a tenant: always-on wins, then override, then tier default. */
export function hasModuleAccess(ent: TenantEntitlements, module: ModuleKey): boolean {
  if (MODULE_BY_KEY[module].alwaysOn) return true;
  const override = ent.overrides[module];
  if (typeof override === "boolean") return override;
  return tierIncludes(ent.tier, module);
}

/** Is this module enabled as a paid à la carte add-on (above the tier)? */
export function isAddOn(ent: TenantEntitlements, module: ModuleKey): boolean {
  const def = MODULE_BY_KEY[module];
  if (def.alwaysOn) return false;
  return hasModuleAccess(ent, module) && !tierIncludes(ent.tier, module);
}

/** Ordered list of modules a tenant can actually see in its nav. */
export function entitledModules(ent: TenantEntitlements): ModuleDef[] {
  return MODULES.filter((m) => hasModuleAccess(ent, m.key));
}

/** Sum of à la carte add-ons currently enabled for a tenant (EUR/mo). */
export function addOnMonthlyTotal(ent: TenantEntitlements): number {
  return MODULES.filter((m) => isAddOn(ent, m.key)).reduce(
    (sum, m) => sum + (m.addOnPriceEurMonthly ?? 0),
    0
  );
}
