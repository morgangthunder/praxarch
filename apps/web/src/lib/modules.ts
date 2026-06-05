import {
  Megaphone,
  Rocket,
  Landmark,
  Workflow,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

/**
 * Tenant-facing product modules.
 *
 * Each module is an independently-toggleable surface with its own left-nav
 * entry and route under /app/[tenant]/<path>. Access is governed by the
 * tenant's subscription tier + per-module overrides (see entitlements below).
 */
export type ModuleKey =
  | "acquisition"
  | "deployments"
  | "finances"
  | "automations"
  | "account";

export type PlanTier = "starter" | "growth" | "scale";

/** Ordered low → high; used for "requires a higher plan" comparisons. */
export const TIER_ORDER: PlanTier[] = ["starter", "growth", "scale"];

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  /** Relative path segment under /app/[tenant]. Empty string = module index. */
  path: string;
  icon: LucideIcon;
  /** One-line purpose shown in nav tooltips, locked screens, and admin. */
  blurb: string;
  /** Lowest tier that includes this module by default. */
  minTier: PlanTier;
}

export const MODULES: ModuleDef[] = [
  {
    key: "acquisition",
    label: "Customer Acquisition",
    path: "acquisition",
    icon: Megaphone,
    blurb: "AI marketing, ad management, and content creation across channels.",
    minTier: "starter",
  },
  {
    key: "automations",
    label: "Automations",
    path: "automations",
    icon: Workflow,
    blurb: "Build agents and n8n-driven workflows that run your business.",
    minTier: "growth",
  },
  {
    key: "deployments",
    label: "Deployments",
    path: "deployments",
    icon: Rocket,
    blurb: "Promote to production, pick source branches, and configure CI/CD.",
    minTier: "growth",
  },
  {
    key: "finances",
    label: "Finances",
    path: "finances",
    icon: Landmark,
    blurb: "Accounting integration, country-specific filing guidance, and analysis.",
    minTier: "scale",
  },
  {
    key: "account",
    label: "Account",
    path: "account",
    icon: SlidersHorizontal,
    blurb: "Plan, credit usage, LLM spend, and integration settings (WhatsApp, etc.).",
    minTier: "starter",
  },
];

export const MODULE_BY_KEY: Record<ModuleKey, ModuleDef> = Object.fromEntries(
  MODULES.map((m) => [m.key, m])
) as Record<ModuleKey, ModuleDef>;

/** Subscription plans: price + the modules each tier unlocks by default. */
export interface PlanDef {
  tier: PlanTier;
  name: string;
  priceEurMonthly: number;
  tagline: string;
}

export const PLANS: Record<PlanTier, PlanDef> = {
  starter: { tier: "starter", name: "Starter", priceEurMonthly: 149, tagline: "Get acquisition running." },
  growth: { tier: "growth", name: "Growth", priceEurMonthly: 399, tagline: "Automate ops & ship faster." },
  scale: { tier: "scale", name: "Scale", priceEurMonthly: 899, tagline: "Full financial autonomy." },
};

/**
 * What a tenant is entitled to: a base tier, plus explicit per-module overrides
 * that the super-admin can flip on/off independent of the tier.
 */
export interface TenantEntitlements {
  tier: PlanTier;
  /** true = force-enabled, false = force-disabled, absent = tier default. */
  overrides: Partial<Record<ModuleKey, boolean>>;
}

function tierRank(tier: PlanTier): number {
  return TIER_ORDER.indexOf(tier);
}

/** Does this tier include the module by default (ignoring overrides)? */
export function tierIncludes(tier: PlanTier, module: ModuleKey): boolean {
  return tierRank(tier) >= tierRank(MODULE_BY_KEY[module].minTier);
}

/** Effective access for a tenant: override wins, else tier default. */
export function hasModuleAccess(ent: TenantEntitlements, module: ModuleKey): boolean {
  const override = ent.overrides[module];
  if (typeof override === "boolean") return override;
  return tierIncludes(ent.tier, module);
}

/** Ordered list of modules a tenant can actually see in its nav. */
export function entitledModules(ent: TenantEntitlements): ModuleDef[] {
  return MODULES.filter((m) => hasModuleAccess(ent, m.key));
}
