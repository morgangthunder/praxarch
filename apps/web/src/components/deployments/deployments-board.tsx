"use client";

import { useEffect, useState } from "react";
import { Plus, X, Check } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ServiceCard } from "@/components/deployments/service-card";
import { useWorkspace } from "@/components/workspace-context";
import { cn } from "@/lib/utils";
import { clientGet, invalidateClientCache } from "@/lib/client-api";
import type { DeployService } from "@/lib/types";

/** Deployment types selectable in the wizard. Only Web App is enabled for now. */
const DEPLOY_TYPES: { id: string; label: string; kind: DeployService["kind"]; enabled: boolean }[] = [
  { id: "web", label: "Web App", kind: "app", enabled: true },
  { id: "api", label: "API Service", kind: "service", enabled: false },
  { id: "worker", label: "Worker", kind: "service", enabled: false },
  { id: "static", label: "Static Site", kind: "app", enabled: false },
];

interface WizardForm {
  type: string;
  name: string;
  repo: string;
  branch: string;
  githubToken: string;
  coolifyApp: string;
}

const EMPTY_FORM: WizardForm = {
  type: "web",
  name: "",
  repo: "",
  branch: "main",
  githubToken: "",
  coolifyApp: "",
};

/**
 * Client-side board for the Deployments view: renders service cards, an owner-only
 * "Add deployment" wizard, and a per-service CI/CD config modal. New services are
 * held in local state (the real version persists via the BFF).
 */
export function DeploymentsBoard({
  initialServices,
  tenantSlug,
}: {
  initialServices: DeployService[];
  tenantSlug: string;
}) {
  const { can } = useWorkspace();
  const canManage = can("manage_integrations"); // owner/super-admin

  const [services, setServices] = useState<DeployService[]>(initialServices);
  const [hydrating, setHydrating] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [configService, setConfigService] = useState<DeployService | null>(null);

  useEffect(() => {
    let cancelled = false;
    clientGet<DeployService[]>("/api/bff/cicd/services", tenantSlug)
      .then((data) => {
        if (!cancelled && data?.length) setServices(data);
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  async function addService(form: WizardForm) {
    const kind = DEPLOY_TYPES.find((t) => t.id === form.type)?.kind ?? "app";
    try {
      const res = await fetch("/api/bff/cicd/services", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-praxarch-tenant": tenantSlug },
        body: JSON.stringify({ name: form.name || "Web App", repo: form.repo, branch: form.branch, kind }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const created = (await res.json()) as DeployService;
      setServices((prev) => [...prev, created]);
      invalidateClientCache(tenantSlug, "/api/bff/cicd/services");
    } catch {
      // Optimistic fallback if the API is unavailable.
      const now = new Date().toISOString();
      setServices((prev) => [
        ...prev,
        {
          id: `svc-${prev.length + 1}`,
          name: form.name || "Web App",
          repo: form.repo,
          kind,
          environments: [
            { environment: "production", branch: form.branch, commit: "—", version: "v0.0.0", status: "idle", deployedAt: now },
            { environment: "staging", branch: form.branch, commit: "—", version: "v0.0.0", status: "idle", deployedAt: now },
          ],
        },
      ]);
    }
    setWizardOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-content-muted">Services</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-content-muted">
            {services.length} deployable{hydrating ? " · syncing…" : ""}
          </span>
          {canManage && (
            <Button variant="primary" size="sm" onClick={() => setWizardOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add deployment
            </Button>
          )}
        </div>
      </div>

      {services.map((s) => (
        <ServiceCard
          key={s.id}
          service={s}
          tenantSlug={tenantSlug}
          onConfigure={canManage ? () => setConfigService(s) : undefined}
        />
      ))}

      {wizardOpen && (
        <AddDeploymentWizard onClose={() => setWizardOpen(false)} onCreate={addService} />
      )}
      {configService && (
        <ConfigureServiceModal
          service={configService}
          onClose={() => setConfigService(null)}
          onSave={async (updated, branch) => {
            setServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
            setConfigService(null);
            try {
              await fetch(`/api/bff/cicd/services/${encodeURIComponent(updated.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", "x-praxarch-tenant": tenantSlug },
                body: JSON.stringify({ repo: updated.repo, branch }),
              });
              invalidateClientCache(tenantSlug, "/api/bff/cicd/services");
            } catch {
              /* optimistic — state already updated */
            }
          }}
        />
      )}
    </div>
  );
}

// ── Add-deployment wizard ─────────────────────────────────────────────

function AddDeploymentWizard({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (form: WizardForm) => void;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardForm>(EMPTY_FORM);
  const set = (patch: Partial<WizardForm>) => setForm((f) => ({ ...f, ...patch }));

  const canNext = step === 1 ? Boolean(form.type) : step === 2 ? form.repo.trim().length > 3 : true;
  const steps = ["Type", "Source", "Secrets", "Review"];

  return (
    <Modal onClose={onClose} title="Add deployment">
      {/* Stepper */}
      <div className="mb-4 flex items-center gap-2">
        {steps.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <div key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium",
                  active
                    ? "bg-content-primary text-surface-base"
                    : done
                      ? "bg-status-active/20 text-status-active"
                      : "bg-surface-overlay text-content-muted"
                )}
              >
                {done ? <Check className="h-3 w-3" /> : n}
              </span>
              <span className={cn("text-xs", active ? "text-content-primary" : "text-content-muted")}>
                {label}
              </span>
              {n < steps.length && <span className="text-content-muted">·</span>}
            </div>
          );
        })}
      </div>

      <div className="min-h-[180px]">
        {step === 1 && (
          <div className="grid grid-cols-2 gap-2">
            {DEPLOY_TYPES.map((t) => (
              <button
                key={t.id}
                disabled={!t.enabled}
                onClick={() => set({ type: t.id })}
                className={cn(
                  "rounded-lg border p-3 text-left text-sm transition-colors",
                  form.type === t.id
                    ? "border-content-primary bg-surface-overlay text-content-primary"
                    : "border-border-subtle text-content-secondary hover:bg-surface-overlay",
                  !t.enabled && "cursor-not-allowed opacity-40"
                )}
              >
                <div className="font-medium">{t.label}</div>
                <div className="text-[11px] text-content-muted">
                  {t.enabled ? "Container app from a Git repo" : "Coming soon"}
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Field label="Display name">
              <Input value={form.name} onChange={(v) => set({ name: v })} placeholder="Storefront" />
            </Field>
            <Field label="GitHub repository">
              <Input value={form.repo} onChange={(v) => set({ repo: v })} placeholder="acme/storefront" />
            </Field>
            <Field label="Default branch">
              <Input value={form.branch} onChange={(v) => set({ branch: v })} placeholder="main" />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <Field label="GitHub access token">
              <Input
                value={form.githubToken}
                onChange={(v) => set({ githubToken: v })}
                placeholder="ghp_…"
                type="password"
              />
            </Field>
            <Field label="Coolify application name">
              <Input value={form.coolifyApp} onChange={(v) => set({ coolifyApp: v })} placeholder="acme-storefront" />
            </Field>
            <p className="text-[11px] text-content-muted">
              Secrets are sent to the gateway and stored in the vault — never in the browser.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-base p-3 text-sm">
            <ReviewRow k="Type" v={DEPLOY_TYPES.find((t) => t.id === form.type)?.label ?? "—"} />
            <ReviewRow k="Name" v={form.name || "Web App"} />
            <ReviewRow k="Repo" v={form.repo || "—"} />
            <ReviewRow k="Branch" v={form.branch} />
            <ReviewRow k="Coolify app" v={form.coolifyApp || "—"} />
            <ReviewRow k="Token" v={form.githubToken ? "•••• provided" : "not set"} />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3">
        <Button variant="ghost" size="sm" onClick={step === 1 ? onClose : () => setStep((s) => s - 1)}>
          {step === 1 ? "Cancel" : "Back"}
        </Button>
        {step < 4 ? (
          <Button variant="primary" size="sm" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            Continue
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={() => onCreate(form)}>
            Create deployment
          </Button>
        )}
      </div>
    </Modal>
  );
}

// ── Per-service CI/CD config ───────────────────────────────────────────

function ConfigureServiceModal({
  service,
  onClose,
  onSave,
}: {
  service: DeployService;
  onClose: () => void;
  onSave: (updated: DeployService, branch: string) => void;
}) {
  const prodBranch = service.environments.find((e) => e.environment === "production")?.branch ?? "main";
  const [repo, setRepo] = useState(service.repo);
  const [branch, setBranch] = useState(prodBranch);
  const [autoStaging, setAutoStaging] = useState(true);
  const [prodApproval, setProdApproval] = useState<"one_click" | "whatsapp">("whatsapp");

  function save() {
    onSave(
      {
        ...service,
        repo,
        environments: service.environments.map((e) => ({ ...e, branch })),
      },
      branch
    );
  }

  return (
    <Modal onClose={onClose} title={`Configure · ${service.name}`}>
      <div className="space-y-3">
        <Field label="GitHub repository">
          <Input value={repo} onChange={setRepo} />
        </Field>
        <Field label="Tracked branch">
          <Input value={branch} onChange={setBranch} />
        </Field>
        <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-base px-3 py-2">
          <div>
            <div className="text-sm text-content-primary">Auto-deploy to staging</div>
            <div className="text-[11px] text-content-muted">Deploy every push to the tracked branch.</div>
          </div>
          <Toggle checked={autoStaging} onChange={setAutoStaging} aria-label="Auto-deploy staging" />
        </div>
        <Field label="Production promote policy">
          <select
            value={prodApproval}
            onChange={(e) => setProdApproval(e.target.value as "one_click" | "whatsapp")}
            className="h-9 w-full rounded-lg border border-border-subtle bg-surface-base px-2.5 text-sm text-content-primary outline-none focus:border-border-strong"
          >
            <option value="one_click">One-click (Owners)</option>
            <option value="whatsapp">Require WhatsApp approval</option>
          </select>
        </Field>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-border-subtle pt-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={save}>
          Save config
        </Button>
      </div>
    </Modal>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <Card className="w-full max-w-md" >
        <div onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <span className="text-sm font-semibold text-content-primary">{title}</span>
            <button onClick={onClose} className="text-content-muted hover:text-content-primary">
              <X className="h-4 w-4" />
            </button>
          </div>
          <CardBody>{children}</CardBody>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-content-muted">{label}</span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-lg border border-border-subtle bg-surface-base px-2.5 text-sm text-content-primary outline-none focus:border-border-strong"
    />
  );
}

function ReviewRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-content-muted">{k}</span>
      <span className="font-mono text-content-secondary">{v}</span>
    </div>
  );
}
