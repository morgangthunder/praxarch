"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppModal } from "@/components/ui/app-modal";
import { Toggle } from "@/components/ui/toggle";
import { ServiceCard } from "@/components/deployments/service-card";
import { DeploymentsSetupTip } from "@/components/deployments/deployments-setup-tip";
import { AddDeploymentWizard, type WizardForm } from "@/components/deployments/add-deployment-wizard";
import { useWorkspace } from "@/components/workspace-context";
import { clientGet, invalidateClientCache } from "@/lib/client-api";
import { loadDeploymentWizardDraft } from "@/lib/deployment-wizard-draft";
import { parseApiError } from "@/lib/parse-api-error";
import type { DeployService } from "@/lib/types";

/**
 * Client-side board for the Deployments view: renders service cards, an owner-only
 * "Add deployment" wizard, and a per-service CI/CD config modal.
 */
export function DeploymentsBoard({
  initialServices,
  tenantSlug,
}: {
  initialServices: DeployService[];
  tenantSlug: string;
}) {
  const { can } = useWorkspace();
  const canManage = can("manage_integrations");

  const [services, setServices] = useState<DeployService[]>(initialServices);
  const [hydrating, setHydrating] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editService, setEditService] = useState<DeployService | null>(null);
  const [wizardInitialStep, setWizardInitialStep] = useState<number | undefined>(undefined);
  const [hasWizardDraft, setHasWizardDraft] = useState(false);
  const [configService, setConfigService] = useState<DeployService | null>(null);

  useEffect(() => {
    setHasWizardDraft(Boolean(loadDeploymentWizardDraft(tenantSlug)));
  }, [tenantSlug, wizardOpen]);

  useEffect(() => {
    let cancelled = false;
    setHydrating(true);
    setLoadError(null);
    clientGet<DeployService[]>("/api/bff/cicd/services", tenantSlug, {
      skipCache: true,
      timeoutMs: 25_000,
      retries: 2,
    })
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setServices(data);
          setLoadError(null);
        } else {
          setLoadError("Could not load services — try refreshing.");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load services — try refreshing.");
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  async function updateDeployment(serviceId: string, form: WizardForm) {
    const res = await fetch(`/api/bff/cicd/services/${encodeURIComponent(serviceId)}/deployment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-praxarch-tenant": tenantSlug },
      body: JSON.stringify({
        name: form.name,
        repo: form.repo,
        stagingBranch: form.stagingBranch,
        productionBranch: form.productionBranch,
        kind: form.type === "api" || form.type === "worker" ? "service" : "app",
        buildPack: form.buildPack,
        portsExposes: form.portsExposes,
        githubToken: form.githubToken.trim() || undefined,
        hosting: form.hosting,
        stagingEnvText: form.stagingEnvText,
        productionEnvText: form.productionEnvText,
        staging: { serverUuid: form.stagingServerUuid },
        ...(form.productionServerUuid
          ? { production: { serverUuid: form.productionServerUuid } }
          : {}),
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message ?? `Save failed (${res.status})`);
    }
    const data = (await res.json()) as { service: DeployService };
    setServices((prev) => prev.map((s) => (s.id === data.service.id ? data.service : s)));
    invalidateClientCache(tenantSlug, "/api/bff/cicd/services");
  }

  function openCreateWizard() {
    setEditService(null);
    setWizardInitialStep(undefined);
    setWizardOpen(true);
  }

  function openManageWizard(service: DeployService, step?: number) {
    setEditService(service);
    setWizardInitialStep(step);
    setWizardOpen(true);
  }

  function closeWizard() {
    setWizardOpen(false);
    setEditService(null);
    setWizardInitialStep(undefined);
  }

  async function provisionDeployment(form: WizardForm) {
    const res = await fetch("/api/bff/cicd/provision", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-praxarch-tenant": tenantSlug },
      body: JSON.stringify({
        name: form.name,
        repo: form.repo,
        stagingBranch: form.stagingBranch,
        productionBranch: form.productionBranch,
        kind: form.type === "api" || form.type === "worker" ? "service" : "app",
        buildPack: form.buildPack,
        portsExposes: form.portsExposes,
        githubToken: form.githubToken.trim() || undefined,
        hosting: form.hosting,
        stagingEnvText: form.stagingEnvText.trim() || undefined,
        productionEnvText: form.productionEnvText.trim() || undefined,
        staging: { serverUuid: form.stagingServerUuid },
        ...(form.productionServerUuid
          ? { production: { serverUuid: form.productionServerUuid } }
          : {}),
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message ?? `Provision failed (${res.status})`);
    }
    const data = (await res.json()) as { service: DeployService };
    setServices((prev) => [...prev, data.service]);
    invalidateClientCache(tenantSlug, "/api/bff/cicd/services");
  }

  return (
    <div className="space-y-4">
      {canManage && <DeploymentsSetupTip tenantSlug={tenantSlug} />}

      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-content-muted">Services</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-content-muted">
            {services.length} deployable{hydrating ? " · syncing…" : ""}
          </span>
          {canManage && (
            <Button variant="primary" size="sm" onClick={openCreateWizard}>
              <Plus className="h-3.5 w-3.5" />
              {hasWizardDraft ? "Resume deployment" : "Add deployment"}
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <p className="rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
          {loadError}
        </p>
      )}

      {!hydrating && services.length === 0 && !loadError && (
        <p className="rounded-lg border border-border-subtle bg-surface-base px-3 py-4 text-sm text-content-muted">
          No deployment services yet. Use <span className="text-content-secondary">Add deployment</span> to
          connect a repo to Coolify on staging (and optionally production).
        </p>
      )}

      {services.map((s) => (
        <ServiceCard
          key={s.id}
          service={s}
          tenantSlug={tenantSlug}
          onConfigure={canManage ? () => setConfigService(s) : undefined}
          onManageDeployment={canManage ? () => openManageWizard(s) : undefined}
        />
      ))}

      {wizardOpen && (
        <AddDeploymentWizard
          tenantSlug={tenantSlug}
          mode={editService ? "edit" : "create"}
          serviceId={editService?.id}
          initialStep={wizardInitialStep}
          onClose={closeWizard}
          onProvision={provisionDeployment}
          onUpdate={updateDeployment}
        />
      )}
      {configService && (
        <ConfigureServiceModal
          service={configService}
          tenantSlug={tenantSlug}
          onClose={() => setConfigService(null)}
          onSave={async (updated, branches) => {
            setServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
            setConfigService(null);
            try {
              await fetch(`/api/bff/cicd/services/${encodeURIComponent(updated.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", "x-praxarch-tenant": tenantSlug },
                body: JSON.stringify({
                  repo: updated.repo,
                  stagingBranch: branches.staging,
                  productionBranch: branches.production,
                }),
              });
              invalidateClientCache(tenantSlug, "/api/bff/cicd/services");
            } catch {
              /* optimistic */
            }
          }}
        />
      )}
    </div>
  );
}

// ── Per-service CI/CD config ───────────────────────────────────────────

function ConfigureServiceModal({
  service,
  tenantSlug,
  onClose,
  onSave,
}: {
  service: DeployService;
  tenantSlug: string;
  onClose: () => void;
  onSave: (updated: DeployService, branches: { staging: string; production: string }) => void;
}) {
  const stagingBranch =
    service.environments.find((e) => e.environment === "staging")?.branch ?? "staging";
  const productionBranch =
    service.environments.find((e) => e.environment === "production")?.branch ?? "master";
  const [repo, setRepo] = useState(service.repo);
  const [stagingBranchInput, setStagingBranchInput] = useState(stagingBranch);
  const [productionBranchInput, setProductionBranchInput] = useState(productionBranch);
  const [autoStaging, setAutoStaging] = useState(true);
  const [prodApproval, setProdApproval] = useState<"one_click" | "whatsapp">("whatsapp");
  const [envTab, setEnvTab] = useState<"staging" | "production">("staging");
  const [stagingEnvText, setStagingEnvText] = useState("");
  const [productionEnvText, setProductionEnvText] = useState("");
  const [envLoading, setEnvLoading] = useState(true);
  const [envSaving, setEnvSaving] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEnvLoading(true);
    setEnvError(null);
    Promise.all(
      (["staging", "production"] as const).map(async (environment) => {
        const res = await fetch("/api/bff/capabilities/deployments.getServiceEnvVars/invoke", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-praxarch-tenant": tenantSlug },
          body: JSON.stringify({ input: { serviceId: service.id, environment } }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          message?: string;
          data?: { envText?: string };
        };
        if (!res.ok) {
          throw new Error(parseApiError(data, `Could not load ${environment} env vars (${res.status})`));
        }
        if (data.status === "error") {
          throw new Error(data.message ?? `Could not load ${environment} env vars`);
        }
        return { environment, envText: data.data?.envText ?? "" };
      })
    )
      .then((rows) => {
        if (cancelled) return;
        for (const row of rows) {
          if (row.environment === "staging") setStagingEnvText(row.envText);
          else setProductionEnvText(row.envText);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setEnvError(err instanceof Error ? err.message : "Could not load environment variables");
        }
      })
      .finally(() => {
        if (!cancelled) setEnvLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [service.id, tenantSlug]);

  async function saveEnvVars() {
    setEnvSaving(true);
    setEnvError(null);
    try {
      const targets: Array<["staging" | "production", string]> = [
        ["staging", stagingEnvText],
        ["production", productionEnvText],
      ];
      for (const [environment, envText] of targets) {
        if (!envText.trim()) continue;
        const res = await fetch("/api/bff/capabilities/deployments.setServiceEnvVars/invoke", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-praxarch-tenant": tenantSlug },
          body: JSON.stringify({
            input: { serviceId: service.id, environment, envText, merge: false },
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          message?: string;
        };
        if (!res.ok) {
          throw new Error(parseApiError(data, `Failed to save ${environment} env vars (${res.status})`));
        }
        if (data.status === "error") {
          throw new Error(data.message ?? `Failed to save ${environment} env vars`);
        }
      }
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setEnvSaving(false);
    }
  }

  function save() {
    onSave(
      {
        ...service,
        repo,
        environments: service.environments.map((e) => ({
          ...e,
          branch: e.environment === "staging" ? stagingBranchInput : productionBranchInput,
        })),
      },
      { staging: stagingBranchInput, production: productionBranchInput }
    );
  }

  return (
    <AppModal
      title={`Configure · ${service.name}`}
      onClose={onClose}
      maxWidth="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save}>
            Save config
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-content-muted">GitHub repository</span>
            <input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              className="h-9 w-full rounded-lg border border-border-subtle bg-surface-base px-2.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-content-muted">Staging branch</span>
            <input
              value={stagingBranchInput}
              onChange={(e) => setStagingBranchInput(e.target.value)}
              placeholder="develop"
              className="h-9 w-full rounded-lg border border-border-subtle bg-surface-base px-2.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-content-muted">Production branch</span>
            <input
              value={productionBranchInput}
              onChange={(e) => setProductionBranchInput(e.target.value)}
              placeholder="master"
              className="h-9 w-full rounded-lg border border-border-subtle bg-surface-base px-2.5 text-sm"
            />
          </label>
          <p className="text-[11px] text-content-muted">
            Each environment deploys from its own branch. Changes sync to the matching Coolify app on save.
          </p>
          <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-base px-3 py-2">
            <div>
              <div className="text-sm text-content-primary">Auto-deploy to staging</div>
              <div className="text-[11px] text-content-muted">
                Deploy every push to the staging branch.
              </div>
            </div>
            <Toggle checked={autoStaging} onChange={setAutoStaging} aria-label="Auto-deploy staging" />
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-content-muted">Production promote policy</span>
            <select
              value={prodApproval}
              onChange={(e) => setProdApproval(e.target.value as "one_click" | "whatsapp")}
              className="h-9 w-full rounded-lg border border-border-subtle bg-surface-base px-2.5 text-sm"
            >
              <option value="one_click">One-click (Owners)</option>
              <option value="whatsapp">Require WhatsApp approval</option>
            </select>
          </label>
          <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
            <div className="mb-2 text-xs font-medium text-content-primary">Environment secrets</div>
            <p className="mb-2 text-[11px] text-content-muted">
              Gitignored <span className="font-mono">.env</span> values — stored encrypted and synced to Coolify on save
              and before each deploy.
            </p>
            <div className="mb-2 flex gap-2">
              {(["staging", "production"] as const).map((env) => (
                <button
                  key={env}
                  type="button"
                  onClick={() => setEnvTab(env)}
                  className={`rounded px-2 py-1 text-xs capitalize ${envTab === env ? "bg-surface-overlay text-content-primary" : "text-content-muted"}`}
                >
                  {env}
                </button>
              ))}
            </div>
            {envLoading ? (
              <p className="text-xs text-content-muted">Loading…</p>
            ) : (
              <textarea
                value={envTab === "staging" ? stagingEnvText : productionEnvText}
                onChange={(e) =>
                  envTab === "staging"
                    ? setStagingEnvText(e.target.value)
                    : setProductionEnvText(e.target.value)
                }
                rows={5}
                placeholder={"MONGO_URI=mongodb://...\nJWT_SECRET=..."}
                className="max-h-40 w-full resize-none overflow-y-auto rounded-lg border border-border-subtle bg-surface-base px-2.5 py-2 font-mono text-xs"
              />
            )}
            {envError && <p className="mt-1 text-xs text-status-error">{envError}</p>}
            <div className="mt-2 flex justify-end">
              <Button variant="secondary" size="sm" disabled={envSaving || envLoading} onClick={saveEnvVars}>
                {envSaving ? "Saving…" : "Save env vars"}
              </Button>
            </div>
          </div>
        </div>
    </AppModal>
  );
}
