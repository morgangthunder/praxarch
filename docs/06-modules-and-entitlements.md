# Modules, Tiers & Entitlements

How Praxarch separates the **two surfaces** (super-admin vs tenant), what
**modules** a tenant can use, and how access is governed by **subscription tier +
per-module overrides**.

> Status: exploratory UI + model. Implemented in the Next.js app; the entitlement
> logic lives in `apps/web/src/lib/modules.ts` and will be mirrored server-side in
> the NestJS BFF (the UI checks are a convenience mirror, not the security boundary).

---

## 1. Two distinct surfaces

| Surface | Routes | Audience | Shell |
|---|---|---|---|
| **Super-Admin** | `/`, `/tenants`, `/flows`, `/prompts` | Platform operators only | `AdminShell` (amber "Admin" badge) |
| **Tenant App** | `/app/[tenant]/<module>` | White-labeled tenant users | `TenantShell` (tenant-branded) |

The Control Center is **never** exposed to tenants. Tenants only ever see their own
white-labeled workspace with the modules they're entitled to.

---

## 2. Tenant modules

Each module is an independently-toggleable surface with its own left-nav entry and route.

| Module | Route | Always-on | Purpose |
|---|---|---|---|
| **Overview** | `/app/[t]/overview` | ✓ | Workspace home: cross-module metrics + pending-actions feed. |
| **Customer Acquisition** | `/app/[t]/acquisition` | | AI marketing, ad management, content creation, campaign metrics. |
| **Automations** | `/app/[t]/automations` | | "Your Agents" + n8n-driven workflows + autonomy control. |
| **Deployments** | `/app/[t]/deployments` | | Promote to prod, pick source branch, configure CI/CD (Coolify). |
| **Finances** | `/app/[t]/finances` | | Accounting integration, country-specific filing guidance, analysis. |
| **Account** | `/app/[t]/account` | ✓ | Plan & upgrades, add-ons, credit allowance + top-ups, LLM spend, integrations. |

Source of truth: `MODULES` in `apps/web/src/lib/modules.ts`. The tenant index
(`/app/[t]`) redirects to **Overview**.

### Overview (workspace home)
- **Metric tiles** are entitlement-filtered — a tile only renders if the tenant has that
  module (e.g. Runway shows only with Finances), so locked modules never leak data.
- **"Needs your attention"** aggregates across modules: HITL approvals, overdue filings,
  failed deploys, and credit warnings — each row links straight to the owning module.
  Built by `getPendingActions(tenant)`.

---

## 3. Pricing tiers + à la carte + credit allowance

| Tier | €/mo | Credits/mo | Unlocks (by default) |
|---|---|---|---|
| **Starter** | 149 | 20,000 | Acquisition (+ Overview, Account always-on) |
| **Growth** | 399 | 75,000 | + Automations, Deployments |
| **Scale** | 899 | 200,000 | + Finances |

Each module declares a `minTier`; a tier includes every module whose `minTier` is at
or below it. (e.g. **Finances requires Scale** — the "higher sub" requirement.)

**À la carte add-ons.** Any module above the tenant's tier can be enabled individually for
a monthly fee instead of upgrading the whole plan:

| Add-on | €/mo |
|---|---|
| Automations | 99 |
| Deployments | 79 |
| Finances | 199 |

An add-on is modelled as a **paid `override = true`** above the tier. `isAddOn(ent, key)`
distinguishes a paid add-on from a tier-included module; `addOnMonthlyTotal(ent)` sums them.

**Credit allowance + top-ups.** Each tier includes a monthly action-credit allowance
(`PLANS[tier].includedCreditsMonthly`). When it runs low, tenants buy **top-up packs**
(`TOPUP_PACKS`: 10k/€49, 50k/€199, 200k/€699) that stack on top of the allowance. Surfaced
in Account via `AllowancePanel` (included vs used vs remaining + top-up purchase).

---

## 4. Entitlement model

A tenant carries:

```ts
interface TenantEntitlements {
  tier: PlanTier;                                  // base plan
  overrides: Partial<Record<ModuleKey, boolean>>;  // force on/off per module
}

// effective access:
hasModuleAccess(ent, module) =
  ent.overrides[module] ?? tierIncludes(ent.tier, module)
```

- **Override = true** → force-enable a module above the tenant's tier. If it's above the
  tier, it's a **paid à la carte add-on** (`isAddOn` = true).
- **Override = false** → force-disable a module the tier would normally include (shows as
  **suspended** in admin; e.g. during an incident or non-payment).
- **No override** → the tier default applies.
- **Always-on** modules (Overview, Account) ignore overrides entirely — always accessible.

This gives the super-admin a single screen (`/tenants`) to flip any module on/off per
tenant (with add-on pricing shown inline), independent of plan, while keeping pricing coherent.

---

## 5. Demo tenants (fixtures)

| Tenant | Tier | Notable | Demonstrates |
|---|---|---|---|
| **Acme Retail** (`/app/acme`) | Scale | all modules on | the **max-access** dummy user |
| **Lumen Health** | Growth | defaults | no Finances |
| **Northwind SaaS** | Growth | `finances: true` override | force-enable above tier |
| **Vela Studio** (`/app/vela`) | Starter | acquisition + account only | restricted tenant + locked nav |
| **Orbit Fitness** | Growth | `deployments: false` override | force-disable below tier |

---

## 6. Gating behavior

- **Nav:** entitled modules render normally; non-entitled modules appear **locked** (lock
  icon, muted) and route to Account with an upgrade hint.
- **Direct URL:** `ModuleGate` wraps each module page. If the tenant lacks access it shows
  an **upgrade screen** (module blurb + required plan + upgrade CTA) instead of content —
  so a hand-typed URL can't bypass the lock. The production server enforces the same check.

---

## 7. Super-admin tooling views

| View | Route | What it does |
|---|---|---|
| **Control Center** | `/` | Global observability across all tenants + MoM agent network. |
| **Tenants** | `/tenants` | Onboard tenants; tier select + per-module access toggles; pricing reference. |
| **Flow Studio** | `/flows` | Register/approve/monitor the n8n workflows that drive agents. |
| **Prompt Registry** | `/prompts` | Version & edit the system prompts for each agent and the chat assistant. |

---

## 8. Decisions locked (2026-06-05)

1. **Locked modules are shown-locked** (upsell), not hidden. ✓
2. **À la carte** add-ons on top of a base tier. ✓
3. **Overview** is the dedicated tenant home (cross-module metrics + pending actions). ✓
4. **Included credit allowance per tier + top-up packs.** ✓

## 9. Open questions (next round)

**Pricing / packaging**
- Are the placeholder prices (tiers €149/399/899; add-ons €99/79/199; top-ups) in the right
  ballpark, or should I model them off a target gross margin on credit cost?
- Do add-ons bring **extra included credits**, or only unlock the module (credits stay at
  tier allowance)? Right now they only unlock the module.
- Should there be an **annual** billing option (e.g. 2 months free) in the UI?
- Per-**seat** pricing at all, or strictly per-**workspace**? (Affects the Account view.)

**Credits**
- One unified "credit", or separate meters (LLM tokens vs ad spend vs API calls)? Currently
  one credit pool + a separate LLM-spend breakdown.
- What happens at **0 credits** — hard stop, auto-top-up, or grace + overage billing?
- Do top-ups **roll over** between months? (Currently modelled as rolling `topUpRemaining`.)

**Overview**
- Which **metrics** matter most on the home tiles (I picked spend, automations, last deploy,
  runway, credits)? Anything to add/remove?
- Should pending actions be **actionable inline** (approve/retry from the row) or always
  deep-link into the module? (Currently deep-link.)

**Modules**
- Is **Account** the right home for add-ons + billing, or should there be a separate
  **Billing** module/section?
- Any **6th module** on the horizon (e.g. Support/Inbox, Analytics, CRM) I should leave a
  slot for?
- For **white-label**, should the tenant ever see "Praxarch" branding, or fully their own?
