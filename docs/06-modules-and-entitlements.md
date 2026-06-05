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

| Module | Route | Purpose |
|---|---|---|
| **Customer Acquisition** | `/app/[t]/acquisition` | AI marketing, ad management, content creation, campaign metrics. |
| **Automations** | `/app/[t]/automations` | "Your Agents" + n8n-driven workflows + autonomy control. |
| **Deployments** | `/app/[t]/deployments` | Promote to prod, pick source branch, configure CI/CD (Coolify). |
| **Finances** | `/app/[t]/finances` | Accounting integration, country-specific filing guidance, analysis. |
| **Account** | `/app/[t]/account` | Plan & upgrades, credits, LLM spend, integrations (WhatsApp, etc.). |

Source of truth: `MODULES` in `apps/web/src/lib/modules.ts`.

---

## 3. Pricing tiers

| Tier | €/mo | Unlocks (by default) |
|---|---|---|
| **Starter** | 149 | Customer Acquisition, Account |
| **Growth** | 399 | + Automations, Deployments |
| **Scale** | 899 | + Finances |

Each module declares a `minTier`; a tier includes every module whose `minTier` is at
or below it. (e.g. **Finances requires Scale** — exactly the "higher sub" requirement.)

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

- **Override = true** → force-enable a module above the tenant's tier (e.g. a goodwill
  trial of Finances on a Growth plan).
- **Override = false** → force-disable a module the tier would normally include (e.g.
  suspend Deployments during an incident).
- **No override** → the tier default applies.

This gives the super-admin a single screen (`/tenants`) to flip any module on/off per
tenant, independent of plan, while keeping pricing coherent.

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

## 8. Open questions (for iteration)

- Should non-entitled modules be **hidden entirely** for some tenants vs. shown-locked as
  an upsell? (Currently shown-locked to surface the upgrade path.)
- Per-**seat** vs per-**workspace** pricing, and where usage/credits fit alongside tiers.
- Add-on modules priced individually (à la carte) on top of a base tier?
- Should Automations be the tenant "home", or a lightweight cross-module overview?
