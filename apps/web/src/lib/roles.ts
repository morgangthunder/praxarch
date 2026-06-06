import type { ModuleKey } from "./modules";

/**
 * Intra-tenant roles + the platform super-admin "hat".
 *
 * Two independent axes, collapsed into one demo "View as" identity:
 *  - Platform: super-admin (sees the /admin console) — or not.
 *  - Workspace: owner / member / viewer (gates modules + actions inside a tenant).
 *
 * A super-admin acting inside a workspace gets owner-level capabilities, so the
 * effective workspace role for "super_admin" is "owner".
 *
 * NOTE: this mirror is for UX only. The NestJS BFF is the real security boundary
 * and must re-check both the entitlement (tier/add-on) and the caller's role.
 */
export type WorkspaceRole = "owner" | "member" | "viewer";

/** What the demo "View as" toggle can select. */
export type ViewIdentity = "super_admin" | WorkspaceRole;

export const VIEW_OPTIONS: { id: ViewIdentity; label: string; hint: string }[] = [
  { id: "super_admin", label: "Super Admin", hint: "Platform operator — sees the admin console + full workspace access." },
  { id: "owner", label: "Owner", hint: "Full workspace access incl. Finances, billing, roles." },
  { id: "member", label: "Member", hint: "Operate acquisition, automations & deployments. No billing/finances." },
  { id: "viewer", label: "Viewer", hint: "Read-only across the modules they can see." },
];

/** Capabilities gate *actions* (not just visibility). */
export type Capability =
  | "deploy" // trigger non-prod deploys
  | "promote_prod" // one-click promote to production
  | "approve" // act on HITL approvals
  | "manage_billing" // plan, add-ons, top-ups
  | "manage_roles" // invite & assign workspace roles
  | "manage_integrations" // connect/disconnect integrations
  | "edit_content" // generate/edit marketing content
  | "edit_automations" // build/toggle automations
  | "edit_crm"; // create/edit contacts and move pipeline deals

/** Effective workspace role for an identity (super-admin acts as owner). */
export function workspaceRole(view: ViewIdentity): WorkspaceRole {
  return view === "super_admin" ? "owner" : view;
}

export function isSuperAdmin(view: ViewIdentity): boolean {
  return view === "super_admin";
}

/**
 * Which modules each workspace role may see (intersected with entitlements).
 * Finances + Account (billing/roles) are owner-only per product decision.
 */
const ROLE_MODULES: Record<WorkspaceRole, ModuleKey[] | "all"> = {
  owner: "all",
  // Members/Viewers see Account (read-only Usage), but not Finances. Billing,
  // team, and integrations inside Account are gated by capability, not visibility.
  member: ["overview", "acquisition", "crm", "automations", "deployments", "account"],
  viewer: ["overview", "acquisition", "crm", "automations", "deployments", "account"],
};

const ROLE_CAPS: Record<WorkspaceRole, Capability[]> = {
  owner: [
    "deploy",
    "promote_prod",
    "approve",
    "manage_billing",
    "manage_roles",
    "manage_integrations",
    "edit_content",
    "edit_automations",
    "edit_crm",
  ],
  // Members operate the business but cannot promote prod, manage money, or manage people.
  member: ["deploy", "approve", "edit_content", "edit_automations", "edit_crm"],
  // Viewers are strictly read-only.
  viewer: [],
};

/** Can this identity see the module at all (before entitlement is considered)? */
export function roleCanSeeModule(view: ViewIdentity, module: ModuleKey): boolean {
  const allowed = ROLE_MODULES[workspaceRole(view)];
  return allowed === "all" || allowed.includes(module);
}

/** Can this identity perform the given action? */
export function can(view: ViewIdentity, capability: Capability): boolean {
  return ROLE_CAPS[workspaceRole(view)].includes(capability);
}
