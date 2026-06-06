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
| **Tenant App** (default) | `/app/[tenant]/<module>` | White-labeled tenant users | `TenantShell` (tenant-branded) |
| **Super-Admin** | `/admin`, `/admin/tenants`, `/admin/flows`, `/admin/prompts` | Platform operators only | `AdminShell` |

**The default experience is the tenant workspace.** The app root (`/`) redirects to the
active tenant's Overview (`/app/acme/overview` in the demo) — *not* to a super-admin view.

The entire platform console lives under `/admin/*` and is reachable only through a single
collapsible **"Super Admin"** group in the tenant nav, which renders **only for super-admins**.
A demo **"View as: Super Admin / Tenant"** toggle in the workspace header stands in for real
auth so you can preview the pure-tenant experience (the Super Admin group disappears).

The Control Center is **never** exposed to tenants.

---

## 2. Tenant modules

Each module is an independently-toggleable surface with its own left-nav entry and route.

| Module | Route | Always-on | Purpose |
|---|---|---|---|
| **Overview** | `/app/[t]/overview` | ✓ | Workspace home: cross-module metrics + pending-actions feed. |
| **Customer Acquisition** | `/app/[t]/acquisition` | | Campaigns, content, top-of-funnel leads + attribution. Syncs identified leads to CRM. |
| **CRM** | `/app/[t]/crm` | | Contacts + pipeline (Kanban). Where Acquisition leads land; Won deals close the attribution loop. |
| **Automations** | `/app/[t]/automations` | | "Your Agents" + n8n-driven workflows + autonomy control (incl. Browser Use Cloud runs). |
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

### Customer Acquisition ↔ CRM (boundary)

| Concern | Customer Acquisition | CRM |
|---|---|---|
| Owns | Campaign spend, content, top-of-funnel volume, click/UTM attribution | Contacts, pipeline stages, deal value, expected close |
| UI | Campaigns, Content, Leads tabs (marketing funnel) | Pipeline Kanban + Contacts table |
| Data flow | Identified lead → `CrmContact` (attribution rides along) | Opportunity `won` → conversion upload + Stripe LTV (CA §9.1, planned) |
| Automation | n8n ingests ad/form events | n8n listens for `crm.opportunity.stage_changed` (planned) |

Starter UI: `CrmHub` at `/app/[t]/crm` (mock fixtures; API `apps/api/src/crm/` deferred).

---

## 3. Pricing tiers + à la carte + credit allowance

| Tier | €/mo | Credits/mo | Unlocks (by default) |
|---|---|---|---|
| **Starter** | 149 | 20,000 | Acquisition, CRM (+ Overview, Account always-on) |
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

This gives the super-admin a single screen (`/admin/tenants`) to flip any module on/off per
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

All grouped under the single **"Super Admin"** nav item (super-admins only):

| View | Route | What it does |
|---|---|---|
| **Control Center** | `/admin` | Global observability across all tenants + MoM agent network. No "deploy" button — deployments are per-tenant (see Deployments module). |
| **Tenants** | `/admin/tenants` | Onboard tenants; tier select + per-module access toggles; pricing reference. |
| **Flow Studio** | `/admin/flows` | Register/approve/monitor the n8n workflows that drive agents. |
| **Prompt Registry** | `/admin/prompts` | Version & edit the system prompts for each agent and the chat assistant. |

> **Ad spend is per-tenant.** Each tenant's campaign spend is derived from its own monthly
> ad budget (`getCampaigns(tenant)` / `getAdSpend(tenant)`); the Control Center only shows an
> *aggregate* "Total ad spend" across tenants. No two tenants share campaign numbers.

---

## 8. Decisions locked (2026-06-05)

1. **Locked modules are shown-locked** (upsell), not hidden. ✓
2. **À la carte** add-ons on top of a base tier. ✓
3. **Overview** is the dedicated tenant home (cross-module metrics + pending actions). ✓
4. **Included credit allowance per tier + top-up packs.** ✓
5. **Tenant-first navigation.** Root redirects to the tenant workspace; super-admin is one
   role-gated collapsible group (`/admin/*`), not the default surface. ✓
6. **Ad spend is per-tenant**, derived from each tenant's own budget. ✓
7. **Deployments are their own (tenant) view** — the global "Deploy production" button was
   removed from the Control Center. ✓

### Decisions locked (2026-06-05, round 2)
8. **Intra-tenant roles.** A workspace has roles (e.g. Owner / Member / Viewer) that gate
   features *within* a tenant (e.g. only Owners see Finances/Account/billing). ✓
9. **One identity, two hats.** A human can be a super-admin **and** a member of a tenant; the
   "View as" toggle becomes a real role switch rather than a demo affordance. ✓
10. **Multi-service deployments.** A tenant may have **1 app, 2 apps, or many services**; the
    Deployments view models a list of deployable services, not a single target. ✓
11. **Promotion UX.** **One-click** for entitled users, **also** triggerable/approvable via
    WhatsApp (reuses the Phase 3 HITL engine). ✓
12. **Ad spend is a separate money meter** — *not* deducted from action credits. Account &
    Overview show credits and ad spend as distinct meters. ✓
13. **`/admin` keeps tenant context** via a "Viewing: <tenant>" breadcrumb that jumps back to
    the workspace. ✓ (implemented in `AdminShell`, fed by `praxarch_active_tenant`.)
14. **Overview is always the landing module** (not last-visited). ✓

## 9. Roles & capabilities (implemented)

Two axes, collapsed into one demo **"View as"** identity (`lib/roles.ts`):

| Identity | Sees admin console | Module visibility | Key capabilities |
|---|---|---|---|
| **Super Admin** | ✓ | all (acts as Owner in-workspace) | everything |
| **Owner** | | all entitled modules | deploy, **promote_prod**, approve, manage_billing/roles/integrations, edit |
| **Member** | | Overview, Acquisition, Automations, Deployments (no Finances/Account) | deploy, approve, edit content/automations — **no** prod promote / billing |
| **Viewer** | | same modules as Member | **read-only** (no actions) |

- **Visibility vs entitlement are separate gates.** Role-hidden modules are *omitted* from the
  nav (not an upsell); entitlement-locked modules still show **locked** (upsell). A module renders
  only when `roleCanSeeModule(view, key)` **and** `hasModuleAccess(ent, key)`.
- **Actions** are gated by `can(view, capability)` via the `useWorkspace()` client context
  (`components/workspace-context.tsx`), provided by `TenantShell`.
- The header **"View as: Super Admin / Owner / Member / Viewer"** toggle (persisted to
  `praxarch_view`) previews each role. This is a demo stand-in for real auth; the BFF re-checks.

## 9b. Deployments view (implemented)

`/app/[tenant]/deployments` is now **Services → Environments** (`getServices(tenant)`):

- A tenant can have **1 app, 2 apps, or many services**; each `ServiceCard` shows its
  **production** and **staging** environments (version, `branch@commit`, status, last deploy,
  an **ahead** badge when staging is ahead of prod).
- **Actions are role-aware** (`ServiceCard` uses `useWorkspace()`):
  - **Deploy staging** — anyone with `deploy` (Owner/Member).
  - **Promote → production** — **one-click for Owners** (`promote_prod`), calls the Phase-2
    CI/CD BFF (`POST /api/bff/cicd/deploy`).
  - **Request prod via WhatsApp** — Members (have `deploy` but not `promote_prod`) open a real
    HITL checkpoint (see §9d). **Owner approval runs the deploy.**
  - **Viewers** see read-only state, no actions.
- **Add deployment (wizard)** — owners get an "Add deployment" wizard (Type → Source → Secrets →
  Review). Only **Web App** is enabled today; others are stubbed "coming soon". New services are
  held in client state (BFF persistence next).
- **Per-service CI/CD config** — a gear on each card opens per-service settings: repo, tracked
  branch, auto-deploy-staging toggle, and **production promote policy** (one-click vs WhatsApp).

## 9d. Promote → WhatsApp HITL → deploy (wired, Phase 2 ↔ 3)

The Member promote path is now backed end-to-end:

```
ServiceCard.requestApproval()
  → POST /api/bff/cicd/promote-request           (Next BFF, no secrets)
  → POST {API}/cicd/promote-request              (PromoteController, whatsapp module)
  → WhatsappService.openDeployCheckpoint()        (checkpoint kind="deploy_promote",
                                                    action={type:"deploy", deploy:{…}})
  → Twilio WhatsApp message to the Owner approver
  … Owner replies "YES" …
  → POST {API}/whatsapp/webhooks/twilio          (signature-verified)
  → WhatsappService.handleInboundReply()          (branches on action.type)
  → CicdService.executeApprovedDeploy()           (no user-RBAC: the approval IS the auth)
  → Coolify deploy (production)
```

Key files: `apps/api/src/whatsapp/{promote.controller,whatsapp.service,checkpoint.types}.ts`,
`apps/api/src/cicd/cicd.service.ts` (`executeApprovedDeploy`). `WhatsappModule` imports
`CicdModule`; the checkpoint carries a `CheckpointAction` so the same inbound webhook resumes
either an **n8n** execution or a **deploy**. *(Needs JWT auth + Twilio/Coolify secrets to fully
execute; the wiring + signature verification are complete.)*

## 9f. Account view (implemented)

`/app/[tenant]/account` is role-aware (`AccountView` + `useWorkspace`):

- **Usage (all roles, read-only for non-owners):**
  - **Credit allowance** meter (included / used / remaining; top-up hidden unless Owner).
  - **Ad budget** meter — the **second money meter**, a *prepaid pool* (decision #12 = prepaid):
    pool / spent / remaining, our **markup %**, and a **per-channel breakdown**. Top-up hidden
    unless Owner. Funded separately from action credits.
  - **LLM spend by module** (decision: grouped by module, not by agent).
- **Owner-only (capability-gated):**
  - **Subscription** (tier switch) + **Add-ons** panel.
  - **Team** — invite by email + assign Owner/Member/Viewer (maps to the same capability model).
  - **Integrations** (WhatsApp, Meta/Google ads, accounting, Coolify…).

Members/Viewers now *see* Account (read-only Usage) but not billing/team/integrations
(`ROLE_MODULES` includes `account`; the sections gate on `manage_billing` / `manage_roles` /
`manage_integrations`). Data: `getAdBudget`, `getAdChannelSpend`, `MOCK_TEAM`,
`MOCK_LLM_BY_MODULE`.

## 9g. Customer Acquisition hub (implemented — v1, defaults)

`/app/[tenant]/acquisition` is a tabbed hub (`AcquisitionHub`) with a persistent agent
**Strategy chat** beside it:

- **Campaigns** — per-tenant campaigns + KPI row (spend, conversions, blended CPA, **ROAS est**
  via `ASSUMED_AOV_EUR`).
- **Content studio** — AI drafts moving through `draft → awaiting → scheduled/published`.
  Behaviour is **autonomy-driven**: `FULLY_AUTONOMOUS` tenants show published/scheduled;
  `APPROVAL_REQUIRED` show an approval queue. Actions are **role-gated** (`edit_content`):
  Approve & publish (in-app), **Request via WhatsApp**, Reject. A **Generate** button adds a draft.
  An autonomy banner deep-links to Automations to change the setting.
- **Leads** — conversion funnel (Leads → Qualified → Conversions) + recent leads list.

Data: `getContentDrafts`, `getFunnel`, `MOCK_LEADS`, `getCampaigns`. *(Built with default
assumptions since the scoping questions were skipped — open to redirection.)*

## 9h. Content publish → WhatsApp HITL → Marketing OS (wired)

The content **"Request via WhatsApp"** action is now backed end-to-end, mirroring the deploy
promote flow:

```
ContentCard.requestApproval()
  → POST /api/bff/marketing/publish-request       (Next BFF, no secrets)
  → POST {API}/marketing/publish-request          (PublishController, whatsapp module)
  → WhatsappService.openContentCheckpoint()        (checkpoint kind="content_publish",
                                                     action={type:"publish", publish:{…}})
  → Twilio WhatsApp message to the approver
  … approver replies "YES" …
  → POST {API}/whatsapp/webhooks/twilio           (signature-verified)
  → WhatsappService.handleInboundReply()           (branches on action.type="publish")
  → MarketingService.publishApprovedContent()      (resolves adapter, publishes)
```

The `CheckpointAction` union now has three arms — **n8n / deploy / publish** — so one inbound
webhook drives all three. `WhatsappModule` imports both `CicdModule` and `MarketingModule`.
Channels map to social platforms via `CHANNEL_TO_PLATFORMS`. *(Needs JWT + Twilio + adapter
keys to fully execute; wiring + signature verification are complete.)*

## 9i. Persistence (implemented — Postgres)

The API now has a real DB layer (`DatabaseService`, node-postgres pool) and three durable
stores in `public` (keyed by TEXT `tenant_id` = slug for the prototype; schema-per-tenant + RLS
is the documented target):

| Table | Written by | Notes |
|-------|-----------|-------|
| `hitl_checkpoints` | `PgCheckpointRepository` | n8n / deploy / publish; `action` as JSONB |
| `deploy_services`  | `ServicesService` | `GET/POST/PATCH /cicd/services`; **seeds defaults on first read** |
| `content_drafts`   | `ContentService` | `GET/POST/PATCH /marketing/content`; seeds defaults on first read |

- **Local auth:** `AUTH_PROVIDER=none` makes `TenantResolverMiddleware` resolve a demo tenant
  (full caps) from the `x-praxarch-tenant` header — so the whole app is exercisable without a
  JWT. Production sets `cognito`/`external` and the stubbed JWT verifier takes over.
- **Web reads** go through `apiGet()` (Server Components) with a **mock fallback** if the API is
  down; **writes** (wizard create, per-service config, content generate/approve/publish) go
  through BFF routes that forward the tenant header. Both are optimistic with graceful fallback.
- Verified: checkpoints persist on promote/publish requests; services + content seed-on-read,
  create, and update; rows confirmed in Postgres.

## 9j. Still to do

- **Resolve approver** from workspace settings (currently `DEPLOY_APPROVER_WAID` /
  `CONTENT_APPROVER_WAID`).
- **Schema-per-tenant + RLS** migration (tables currently share `public` with a `tenant_id`).
- **Persist** remaining client-only state: ad/credit top-ups, team changes.
- Wire the Twilio inbound webhook signature for a full local approve→execute demo.

## 10. Open questions (next round)

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
