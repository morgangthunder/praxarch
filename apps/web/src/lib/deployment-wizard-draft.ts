import type { WizardForm } from "@/components/deployments/add-deployment-wizard";



export interface WizardServerFormDraft {

  name: string;

  host: string;

  port: string;

  user: string;

  sshPrivateKey: string;

}



export interface DeploymentWizardDraft {

  step: number;

  form: WizardForm;

  showAddServer: boolean;

  serverForm: WizardServerFormDraft;

  savedAt: string;

  /** When set, draft is for editing an existing service. */

  serviceId?: string;

}



function storageKey(tenantSlug: string, serviceId?: string): string {

  return serviceId

    ? `praxarch_deploy_wizard_edit_${tenantSlug}_${serviceId}`

    : `praxarch_deploy_wizard_draft_${tenantSlug}`;

}



export function loadDeploymentWizardDraft(

  tenantSlug: string,

  serviceId?: string

): DeploymentWizardDraft | null {

  if (typeof window === "undefined") return null;

  try {

    const raw = window.localStorage.getItem(storageKey(tenantSlug, serviceId));

    if (!raw) return null;

    const parsed = JSON.parse(raw) as DeploymentWizardDraft;

    if (!parsed?.form || typeof parsed.step !== "number") return null;

    if (serviceId && parsed.serviceId && parsed.serviceId !== serviceId) return null;

    return parsed;

  } catch {

    return null;

  }

}



export function saveDeploymentWizardDraft(

  tenantSlug: string,

  draft: Omit<DeploymentWizardDraft, "savedAt"> & { serviceId?: string }

): void {

  if (typeof window === "undefined") return;

  try {

    const payload: DeploymentWizardDraft = { ...draft, savedAt: new Date().toISOString() };

    window.localStorage.setItem(storageKey(tenantSlug, draft.serviceId), JSON.stringify(payload));

  } catch {

    /* quota / private mode */

  }

}



export function clearDeploymentWizardDraft(tenantSlug: string, serviceId?: string): void {

  if (typeof window === "undefined") return;

  window.localStorage.removeItem(storageKey(tenantSlug, serviceId));

}


