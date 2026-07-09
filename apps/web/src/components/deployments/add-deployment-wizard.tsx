"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Check, Loader2, AlertCircle, Cloud, Server, Laptop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppModal } from "@/components/ui/app-modal";
import { useAssistant } from "@/components/assistant/assistant-context";
import { cn } from "@/lib/utils";
import { clientGet, invalidateClientCache } from "@/lib/client-api";
import {
  clearDeploymentWizardDraft,
  loadDeploymentWizardDraft,
  saveDeploymentWizardDraft,
} from "@/lib/deployment-wizard-draft";
import { parseApiError } from "@/lib/parse-api-error";
import { validateSshPrivateKeyClient } from "@/lib/ssh-key";

type BuildPack = "nixpacks" | "dockercompose" | "dockerfile" | "static" | "railpack";
export type HostingTopology = "local" | "cloud-split" | "cloud-single";

const HOSTING_TOPOLOGIES: {
  id: HostingTopology;
  label: string;
  hint: string;
  enabled: boolean;
  Icon: typeof Laptop;
}[] = [
  {
    id: "local",
    label: "Local / platform",
    hint: "Staging + production on shared localhost — quick dev & demos",
    enabled: true,
    Icon: Laptop,
  },
  {
    id: "cloud-split",
    label: "Cloud — separate servers",
    hint: "Dedicated EC2/VPS for staging and production (e.g. Bubblbook)",
    enabled: true,
    Icon: Cloud,
  },
  {
    id: "cloud-single",
    label: "Cloud — one server",
    hint: "Both environments on a single EC2/VPS instance",
    enabled: true,
    Icon: Server,
  },
];

const DEPLOY_TYPES: {
  id: string;
  label: string;
  kind: "app" | "service";
  buildPack: BuildPack;
  defaultPort: string;
  enabled: boolean;
  hint: string;
}[] = [
  { id: "web", label: "Web App", kind: "app", buildPack: "dockercompose", defaultPort: "3000", enabled: true, hint: "Docker Compose or full-stack repo" },
  { id: "api", label: "API Service", kind: "service", buildPack: "nixpacks", defaultPort: "3000", enabled: true, hint: "Node, Python, Go API from source" },
  { id: "worker", label: "Background Worker", kind: "service", buildPack: "nixpacks", defaultPort: "8080", enabled: true, hint: "Queue processor or cron worker" },
  { id: "static", label: "Static Site", kind: "app", buildPack: "static", defaultPort: "80", enabled: true, hint: "SPA or static HTML export" },
  { id: "dockerfile", label: "Custom Dockerfile", kind: "app", buildPack: "dockerfile", defaultPort: "3000", enabled: true, hint: "Bring your own Dockerfile" },
  { id: "railpack", label: "Railpack", kind: "app", buildPack: "railpack", defaultPort: "3000", enabled: true, hint: "Railpack auto-detect build" },
];

interface CoolifyServerOption {
  uuid: string;
  name: string;
  host: string | null;
  usable: boolean;
  reachable: boolean;
  platform?: boolean;
  validated?: boolean;
  validationMessage?: string;
}

interface AddServerForm {
  name: string;
  host: string;
  port: string;
  user: string;
  sshPrivateKey: string;
}

const EMPTY_SERVER_FORM: AddServerForm = {
  name: "",
  host: "",
  port: "22",
  user: "ubuntu",
  sshPrivateKey: "",
};

export interface WizardForm {
  hosting: HostingTopology;
  type: string;
  name: string;
  repo: string;
  stagingBranch: string;
  productionBranch: string;
  githubToken: string;
  repoPrivate: boolean | null;
  accessVerified: boolean;
  stagingServerUuid: string;
  productionServerUuid: string;
  buildPack: BuildPack;
  portsExposes: string;
  stagingEnvText: string;
  productionEnvText: string;
  stagingDeployProfile: DeployProfile;
  productionDeployProfile: DeployProfile;
}

export type DeployProfile = "coolify" | "source-compose" | "source-compose-host";

export const DEPLOY_PROFILE_OPTIONS: {
  id: DeployProfile;
  label: string;
  hint: string;
}[] = [
  {
    id: "coolify",
    label: "Coolify (default)",
    hint: "Standard git deploy via Coolify API.",
  },
  {
    id: "source-compose",
    label: "Source build (compose overlay)",
    hint: "SSH build from Dockerfile when compose pins a stale registry image.",
  },
  {
    id: "source-compose-host",
    label: "Source build (host network)",
    hint: "For apps that reach Redis/Mongo/MCP on 127.0.0.1 on the host.",
  },
];

export const EMPTY_WIZARD_FORM: WizardForm = {
  hosting: "cloud-split",
  type: "web",
  name: "",
  repo: "",
  stagingBranch: "staging",
  productionBranch: "master",
  githubToken: "",
  repoPrivate: null,
  accessVerified: false,
  stagingServerUuid: "",
  productionServerUuid: "",
  buildPack: "dockercompose",
  portsExposes: "3000",
  stagingEnvText: "",
  productionEnvText: "",
  stagingDeployProfile: "coolify",
  productionDeployProfile: "coolify",
};

type ServerValStatus = "idle" | "checking" | "valid" | "invalid";
type ProvisionPhase = "idle" | "provisioning" | "done" | "error";

/** Migrate wizard drafts saved before per-environment branches. */
function normalizeWizardForm(raw: Partial<WizardForm> & { branch?: string }): WizardForm {
  const merged = { ...EMPTY_WIZARD_FORM, ...raw };
  if (!raw.stagingBranch && raw.branch) merged.stagingBranch = raw.branch;
  if (!raw.productionBranch && raw.branch) merged.productionBranch = raw.branch;
  return merged;
}
export type DeploymentWizardMode = "create" | "edit";

const STEPS = ["Hosting", "Stack", "Access", "Source", "Targets", "Reconcile", "Secrets", "Review"] as const;

function targetsGateMet(
  form: WizardForm,
  hosting: HostingTopology,
  isServerValid: (uuid: string) => boolean
): boolean {
  const stagingOk = Boolean(form.stagingServerUuid && isServerValid(form.stagingServerUuid));
  if (hosting === "local" || hosting === "cloud-single") {
    return stagingOk;
  }
  const productionOk =
    !form.productionServerUuid ||
    (isServerValid(form.productionServerUuid) && form.productionServerUuid !== form.stagingServerUuid);
  return stagingOk && productionOk;
}

function stepGateMet(
  stepNum: number,
  form: WizardForm,
  hosting: HostingTopology,
  isServerValid: (uuid: string) => boolean,
  mode: DeploymentWizardMode
): boolean {
  switch (stepNum) {
    case 1:
      return Boolean(form.hosting);
    case 2:
      return Boolean(form.type);
    case 3:
      if (mode === "edit" && form.accessVerified && !form.githubToken.trim()) {
        return form.repo.trim().length > 3;
      }
      return form.repo.trim().length > 3 && (!form.githubToken.trim() || form.accessVerified);
    case 4:
      return form.name.trim().length > 0;
    case 5:
      return targetsGateMet(form, hosting, isServerValid);
    default:
      return true;
  }
}

function canNavigateToStep(
  target: number,
  current: number,
  form: WizardForm,
  hosting: HostingTopology,
  isServerValid: (uuid: string) => boolean,
  mode: DeploymentWizardMode
): boolean {
  if (target < 1 || target > STEPS.length) return false;
  if (target === current) return true;
  if (target < current) return true;
  for (let s = 1; s < target; s++) {
    if (!stepGateMet(s, form, hosting, isServerValid, mode)) return false;
  }
  return true;
}

function hasWizardProgress(
  step: number,
  form: WizardForm,
  serverForm: AddServerForm,
  showAddServer: boolean
): boolean {
  if (step > 1 || showAddServer) return true;
  if (serverForm.name.trim() || serverForm.host.trim() || serverForm.sshPrivateKey.trim()) return true;
  return Boolean(
    form.name.trim() ||
      form.repo.trim() ||
      form.githubToken.trim() ||
      form.stagingEnvText.trim() ||
      form.productionEnvText.trim() ||
      form.stagingServerUuid ||
      form.productionServerUuid
  );
}

function initialWizardState(tenantSlug: string, mode: DeploymentWizardMode, serviceId?: string, initialStep?: number) {
  const draft = loadDeploymentWizardDraft(tenantSlug, mode === "edit" ? serviceId : undefined);
  if (!draft) {
    return {
      step: initialStep ?? 1,
      form: EMPTY_WIZARD_FORM,
      showAddServer: false,
      serverForm: EMPTY_SERVER_FORM,
      restored: false,
    };
  }
  return {
    step: initialStep ?? Math.min(Math.max(draft.step, 1), STEPS.length),
    form: normalizeWizardForm(draft.form),
    showAddServer: draft.showAddServer,
    serverForm: { ...EMPTY_SERVER_FORM, ...draft.serverForm },
    restored: true,
  };
}

export function AddDeploymentWizard({
  tenantSlug,
  mode = "create",
  serviceId,
  initialStep,
  onClose,
  onProvision,
  onUpdate,
}: {
  tenantSlug: string;
  mode?: DeploymentWizardMode;
  serviceId?: string;
  initialStep?: number;
  onClose: () => void;
  onProvision: (form: WizardForm) => Promise<void>;
  onUpdate?: (serviceId: string, form: WizardForm) => Promise<void>;
}) {
  const isEdit = mode === "edit" && Boolean(serviceId);
  const init = initialWizardState(tenantSlug, mode, serviceId, initialStep);
  const [step, setStep] = useState(init.step);
  const [form, setForm] = useState<WizardForm>(init.form);
  const [draftRestored, setDraftRestored] = useState(init.restored);
  const [servers, setServers] = useState<CoolifyServerOption[]>([]);
  const [serversLoading, setServersLoading] = useState(false);
  const [serversError, setServersError] = useState<string | null>(null);
  const [serverVal, setServerVal] = useState<Record<string, { status: ServerValStatus; message?: string }>>({});
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [phase, setPhase] = useState<ProvisionPhase>("idle");
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisionLog, setProvisionLog] = useState<string[]>([]);
  const [showAddServer, setShowAddServer] = useState(init.showAddServer);
  const [serverForm, setServerForm] = useState<AddServerForm>(init.serverForm);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(isEdit);
  const [configError, setConfigError] = useState<string | null>(null);
  const { ask } = useAssistant();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (phase !== "idle") return;
    if (!hasWizardProgress(step, form, serverForm, showAddServer)) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDeploymentWizardDraft(tenantSlug, {
        step,
        form,
        showAddServer,
        serverForm,
        serviceId: isEdit ? serviceId : undefined,
      });
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [tenantSlug, step, form, showAddServer, serverForm, phase, isEdit, serviceId]);

  useEffect(() => {
    if (!isEdit || !serviceId) return;
    let cancelled = false;
    setConfigLoading(true);
    setConfigError(null);
    fetch(`/api/bff/cicd/services/${encodeURIComponent(serviceId)}/wizard`, {
      headers: { "x-praxarch-tenant": tenantSlug },
      cache: "no-store",
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(parseApiError(data, `Could not load deployment (${res.status})`));
        return data as {
          hosting: HostingTopology;
          type: string;
          name: string;
          repo: string;
          branch?: string;
          stagingBranch: string;
          productionBranch: string;
          buildPack: BuildPack;
          portsExposes: string;
          stagingServerUuid: string;
          productionServerUuid: string;
          stagingEnvText: string;
          productionEnvText: string;
          stagingDeployProfile?: DeployProfile;
          productionDeployProfile?: DeployProfile;
          accessVerified: boolean;
          targets: {
            staging: { status: string };
            production: { status: string } | null;
          };
        };
      })
      .then((cfg) => {
        if (cancelled) return;
        if (!draftRestored) {
          setForm(
            normalizeWizardForm({
              hosting: cfg.hosting,
              type: cfg.type,
              name: cfg.name,
              repo: cfg.repo,
              stagingBranch: cfg.stagingBranch ?? cfg.branch,
              productionBranch: cfg.productionBranch ?? cfg.branch,
              githubToken: "",
              repoPrivate: null,
              accessVerified: cfg.accessVerified,
              stagingServerUuid: cfg.stagingServerUuid,
              productionServerUuid: cfg.productionServerUuid,
              buildPack: cfg.buildPack,
              portsExposes: cfg.portsExposes,
              stagingEnvText: cfg.stagingEnvText,
              productionEnvText: cfg.productionEnvText,
              stagingDeployProfile: cfg.stagingDeployProfile ?? "coolify",
              productionDeployProfile: cfg.productionDeployProfile ?? "coolify",
            })
          );
        }
        if (cfg.stagingServerUuid && cfg.targets.staging.status === "ready") {
          setServerValidation(cfg.stagingServerUuid, "valid", "Previously provisioned");
        }
        if (
          cfg.productionServerUuid &&
          cfg.productionServerUuid !== cfg.stagingServerUuid &&
          cfg.targets.production?.status === "ready"
        ) {
          setServerValidation(cfg.productionServerUuid, "valid", "Previously provisioned");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setConfigError(err instanceof Error ? err.message : "Could not load deployment");
        }
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, serviceId, tenantSlug]);

  function discardDraft() {
    clearDeploymentWizardDraft(tenantSlug, isEdit ? serviceId : undefined);
    setStep(1);
    setForm(EMPTY_WIZARD_FORM);
    setShowAddServer(false);
    setServerForm(EMPTY_SERVER_FORM);
    setServerVal({});
    setDraftRestored(false);
  }

  const set = (patch: Partial<WizardForm>) => setForm((f) => ({ ...f, ...patch }));
  const setServerField = (patch: Partial<AddServerForm>) => setServerForm((f) => ({ ...f, ...patch }));

  const typeDef = DEPLOY_TYPES.find((t) => t.id === form.type) ?? DEPLOY_TYPES[0];
  const hostingDef = HOSTING_TOPOLOGIES.find((h) => h.id === form.hosting) ?? HOSTING_TOPOLOGIES[1];
  const isCloud = form.hosting !== "local";
  const needsSplitServers = form.hosting === "cloud-split";

  // Unique target servers to scan on the Reconcile step (staging + optional prod).
  const reconcileTargets: ReconcileTarget[] = (() => {
    const seen = new Set<string>();
    const out: ReconcileTarget[] = [];
    const add = (uuid: string, role: string) => {
      if (!uuid || seen.has(uuid)) return;
      seen.add(uuid);
      const srv = servers.find((s) => s.uuid === uuid);
      out.push({ uuid, label: srv?.name ?? role, host: srv?.host ?? null, role });
    };
    add(form.stagingServerUuid, "Staging");
    if (needsSplitServers) add(form.productionServerUuid, "Production");
    return out;
  })();

  function setServerValidation(uuid: string, status: ServerValStatus, message?: string) {
    setServerVal((prev) => ({ ...prev, [uuid]: { status, message } }));
  }

  function isServerValid(uuid: string): boolean {
    return serverVal[uuid]?.status === "valid";
  }

  async function validateServerUuid(uuid: string) {
    if (!uuid) return;
    setServerValidation(uuid, "checking");
    try {
      const res = await fetch(`/api/bff/cicd/coolify/servers/${encodeURIComponent(uuid)}/validate`, {
        method: "POST",
        headers: { "x-praxarch-tenant": tenantSlug },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseApiError(data, `Validation failed (${res.status})`));
      if (data.validated || (data.reachable && data.usable)) {
        setServerValidation(uuid, "valid", (data as CoolifyServerOption).validationMessage ?? "SSH and Docker verified");
        setServers((prev) =>
          prev.map((s) => (s.uuid === uuid ? { ...s, ...(data as CoolifyServerOption), validated: true } : s))
        );
      } else {
        setServerValidation(uuid, "invalid", (data as CoolifyServerOption).validationMessage ?? "Server not reachable");
      }
    } catch (e) {
      setServerValidation(uuid, "invalid", e instanceof Error ? e.message : "Validation failed");
    }
  }

  async function loadServers(selectNewUuid?: string) {
    setServersLoading(true);
    setServersError(null);
    try {
      const list =
        (await clientGet<CoolifyServerOption[]>("/api/bff/cicd/coolify/servers", tenantSlug, {
          skipCache: true,
          timeoutMs: 30_000,
        })) ?? [];
      setServers(list);
      const localhost = list.find((s) => s.platform);

      if (form.hosting === "local" && localhost) {
        set({ stagingServerUuid: localhost.uuid, productionServerUuid: localhost.uuid });
        void validateServerUuid(localhost.uuid);
      } else if (selectNewUuid) {
        set(
          form.hosting === "cloud-single"
            ? { stagingServerUuid: selectNewUuid, productionServerUuid: selectNewUuid }
            : { stagingServerUuid: selectNewUuid }
        );
        void validateServerUuid(selectNewUuid);
      } else if (list.length && !form.stagingServerUuid) {
        const first = list.find((s) => s.usable && !s.platform) ?? list.find((s) => s.usable) ?? list[0];
        const second = list.find((s) => s.uuid !== first.uuid && s.usable);
        if (form.hosting === "cloud-single") {
          set({ stagingServerUuid: first.uuid, productionServerUuid: first.uuid });
        } else if (form.hosting === "cloud-split") {
          set({
            stagingServerUuid: first.uuid,
            productionServerUuid: second?.uuid ?? "",
          });
        }
      }

      if (!selectNewUuid) {
        if (form.stagingServerUuid) void validateServerUuid(form.stagingServerUuid);
        if (form.productionServerUuid && form.productionServerUuid !== form.stagingServerUuid) {
          void validateServerUuid(form.productionServerUuid);
        }
      }
    } catch {
      setServersError("Could not load deployment servers");
    } finally {
      setServersLoading(false);
    }
  }

  useEffect(() => {
    if (step === 5 || step === 6) void loadServers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, tenantSlug, form.hosting]);

  function selectHosting(id: HostingTopology) {
    set({
      hosting: id,
      stagingServerUuid: "",
      productionServerUuid: "",
    });
    setServerVal({});
  }

  async function registerServer() {
    setRegistering(true);
    setRegisterError(null);
    const keyCheck = validateSshPrivateKeyClient(serverForm.sshPrivateKey);
    if (!keyCheck.ok) {
      setRegisterError(keyCheck.error);
      setRegistering(false);
      return;
    }
    try {
      const res = await fetch("/api/bff/cicd/coolify/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-praxarch-tenant": tenantSlug },
        body: JSON.stringify({
          name: serverForm.name,
          host: serverForm.host,
          port: Number(serverForm.port) || 22,
          user: serverForm.user || "root",
          sshPrivateKey: keyCheck.normalized,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseApiError(data, `Registration failed (${res.status})`));
      const server = data as CoolifyServerOption;
      setServerForm(EMPTY_SERVER_FORM);
      setShowAddServer(false);
      if (server.validated) {
        setServerValidation(server.uuid, "valid", server.validationMessage);
      } else {
        setServerValidation(server.uuid, "invalid", server.validationMessage);
      }
      await loadServers(server.uuid);
      invalidateClientCache(tenantSlug, "/api/bff/cicd/coolify/servers");
    } catch (e) {
      setRegisterError(e instanceof Error ? e.message : "Server registration failed");
    } finally {
      setRegistering(false);
    }
  }

  function selectType(typeId: string) {
    const t = DEPLOY_TYPES.find((d) => d.id === typeId);
    if (!t) return;
    set({ type: typeId, buildPack: t.buildPack, portsExposes: t.defaultPort });
  }

  async function verifyAccess() {
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch("/api/bff/cicd/github/verify-access", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-praxarch-tenant": tenantSlug },
        body: JSON.stringify({ repo: form.repo, githubToken: form.githubToken }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message ?? "Verification failed");
      }
      const data = (await res.json()) as { private: boolean };
      set({ accessVerified: true, repoPrivate: data.private });
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : "Verification failed");
      set({ accessVerified: false, repoPrivate: null });
    } finally {
      setVerifying(false);
    }
  }

  const canNext = stepGateMet(step, form, form.hosting, isServerValid, mode);

  function goToStep(target: number) {
    if (!canNavigateToStep(target, step, form, form.hosting, isServerValid, mode)) return;
    setStep(target);
  }

  async function submit() {
    setPhase("provisioning");
    setProvisionError(null);
    const actionLines = isEdit
      ? [
          "Updating service record…",
          "Syncing deployment targets…",
          "Pushing environment secrets…",
        ]
      : [
          "Creating service record…",
          "Provisioning staging on Coolify…",
          "Syncing environment secrets…",
        ];
    if (form.hosting === "cloud-split" && form.productionServerUuid && isServerValid(form.productionServerUuid)) {
      actionLines.push(isEdit ? "Updating production target…" : "Provisioning production on Coolify…");
    } else if (form.hosting === "cloud-split") {
      actionLines.push("Production skipped — configure when ready.");
    } else if (!isEdit) {
      actionLines.push("Provisioning production on Coolify…");
    }
    setProvisionLog(actionLines);
    try {
      if (isEdit && serviceId && onUpdate) {
        await onUpdate(serviceId, form);
      } else {
        await onProvision(form);
      }
      clearDeploymentWizardDraft(tenantSlug, isEdit ? serviceId : undefined);
      setProvisionLog((l) => [...l, isEdit ? "Done — changes saved." : "Done — deployment targets ready."]);
      setPhase("done");
      setTimeout(onClose, 1200);
    } catch (e) {
      setProvisionError(e instanceof Error ? e.message : isEdit ? "Save failed" : "Provisioning failed");
      setPhase("error");
    }
  }

  if (phase === "provisioning" || phase === "done" || phase === "error") {
    return (
      <AppModal
        title={isEdit ? "Saving deployment" : "Provisioning deployment"}
        onClose={phase === "error" ? onClose : () => {}}
        closeOnBackdrop={phase === "error"}
        maxWidth="lg"
        assistantAware
        footer={
          phase === "error" ? (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-3">
          {provisionLog.map((line, i) => (
            <div key={line} className="flex items-center gap-2 text-sm text-content-secondary">
              {i < provisionLog.length - 1 || phase === "done" ? (
                <Check className="h-4 w-4 shrink-0 text-status-active" />
              ) : phase === "error" ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-status-error" />
              ) : (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-content-muted" />
              )}
              {line}
            </div>
          ))}
          {provisionError && (
            <p className="rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
              {provisionError}
            </p>
          )}
        </div>
      </AppModal>
    );
  }

  const wizardFooter = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={step === 1 ? onClose : () => goToStep(step - 1)}>
          {step === 1 ? "Cancel" : "Back"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            ask("Help me with this step", {
              module: "deployments",
              wizardStep: STEPS[step - 1],
              wizardHosting: form.hosting,
              wizardStepIndex: String(step),
              wizardRepo: form.repo,
              wizardName: form.name,
            })
          }
        >
          Ask assistant
        </Button>
      </div>
      {step < STEPS.length ? (
        <Button variant="primary" size="sm" disabled={!canNext} onClick={() => goToStep(step + 1)}>
          Continue
        </Button>
      ) : (
        <Button variant="primary" size="sm" onClick={submit}>
          {isEdit ? "Save changes" : "Provision deployment"}
        </Button>
      )}
    </div>
  );

  return (
    <AppModal
      title={isEdit ? "Manage deployment" : "Add deployment"}
      onClose={onClose}
      maxWidth="lg"
      assistantAware
      footer={configLoading ? undefined : wizardFooter}
    >
      {configLoading ? (
        <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-content-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading deployment…
        </div>
      ) : (
        <>
      {configError && (
        <p className="mb-3 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
          {configError}
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          const reachable = canNavigateToStep(n, step, form, form.hosting, isServerValid, mode);
          return (
            <div key={label} className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => goToStep(n)}
                title={
                  reachable
                    ? `Go to ${label}`
                    : `Complete earlier steps to open ${label}`
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-0.5 transition-colors",
                  reachable ? "hover:bg-surface-base" : "cursor-not-allowed opacity-50"
                )}
              >
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
              </button>
              {n < STEPS.length && <span className="text-content-muted">·</span>}
            </div>
          );
        })}
      </div>

      {draftRestored && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-xs text-content-secondary">
          <span>
            {isEdit ? "Unsaved edits restored" : "Draft restored"} — step {step} ({STEPS[step - 1]})
          </span>
          <button type="button" className="shrink-0 text-content-muted hover:text-content-primary" onClick={discardDraft}>
            Discard
          </button>
        </div>
      )}

      <div className="min-h-[220px]">
        {step === 1 && (
          <div className="space-y-2">
            <p className="text-xs text-content-muted">
              Where will this app run? This controls server registration, validation gates, and later steps.
            </p>
            <div className="grid gap-2">
              {HOSTING_TOPOLOGIES.map((h) => (
                <button
                  key={h.id}
                  disabled={!h.enabled}
                  onClick={() => selectHosting(h.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                    form.hosting === h.id
                      ? "border-content-primary bg-surface-overlay text-content-primary"
                      : "border-border-subtle text-content-secondary hover:bg-surface-overlay"
                  )}
                >
                  <h.Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-medium">{h.label}</div>
                    <div className="text-[11px] text-content-muted">{h.hint}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-2 gap-2">
            {DEPLOY_TYPES.map((t) => (
              <button
                key={t.id}
                disabled={!t.enabled}
                onClick={() => selectType(t.id)}
                className={cn(
                  "rounded-lg border p-3 text-left text-sm transition-colors",
                  form.type === t.id
                    ? "border-content-primary bg-surface-overlay text-content-primary"
                    : "border-border-subtle text-content-secondary hover:bg-surface-overlay"
                )}
              >
                <div className="font-medium">{t.label}</div>
                <div className="text-[11px] text-content-muted">{t.hint}</div>
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-xs text-content-muted">
              Grant Praxarch access to your repository. Private repos require a verified GitHub PAT before continuing.
              {isEdit && (
                <>
                  {" "}
                  Already provisioned — leave the token blank unless you are rotating credentials.
                </>
              )}
            </p>
            <Field label="GitHub repository">
              <Input
                value={form.repo}
                onChange={(v) => set({ repo: v, accessVerified: false, repoPrivate: null })}
                placeholder="owner/repo"
              />
            </Field>
            <Field label="GitHub personal access token">
              <Input
                value={form.githubToken}
                onChange={(v) => set({ githubToken: v, accessVerified: false, repoPrivate: null })}
                placeholder="ghp_…"
                type="password"
              />
            </Field>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={verifying || form.repo.trim().length < 4 || !form.githubToken}
                onClick={verifyAccess}
              >
                {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Verify access
              </Button>
              {form.accessVerified && (
                <span className="text-xs text-status-active">
                  Access confirmed{form.repoPrivate ? " (private)" : " (public)"}
                </span>
              )}
            </div>
            {verifyError && <p className="text-xs text-status-error">{verifyError}</p>}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <Field label="Display name">
              <Input value={form.name} onChange={(v) => set({ name: v })} placeholder="Storefront" />
            </Field>
            <Field label="Staging branch">
              <Input
                value={form.stagingBranch}
                onChange={(v) => set({ stagingBranch: v })}
                placeholder="staging"
              />
            </Field>
            <Field label="Production branch">
              <Input
                value={form.productionBranch}
                onChange={(v) => set({ productionBranch: v })}
                placeholder="master"
              />
            </Field>
            <ReviewRow k="Hosting" v={hostingDef.label} />
            <ReviewRow k="Stack" v={typeDef.label} />
            <ReviewRow k="Repository" v={form.repo} />
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <p className="text-xs text-content-muted">
              {form.hosting === "local"
                ? "Validating platform localhost — both environments deploy here."
                : form.hosting === "cloud-single"
                  ? "Register one cloud server and validate SSH + Docker before continuing."
                  : "Register and validate staging first. Production is optional — add it now or configure later before your first prod deploy."}
            </p>
            {serversLoading && (
              <div className="flex items-center gap-2 text-xs text-content-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading servers…
              </div>
            )}
            {serversError && <p className="text-xs text-status-error">{serversError}</p>}

            {form.hosting === "local" && form.stagingServerUuid && (
              <ServerValidationRow
                label="Platform localhost"
                uuid={form.stagingServerUuid}
                state={serverVal[form.stagingServerUuid]}
                onRevalidate={() => validateServerUuid(form.stagingServerUuid)}
              />
            )}

            {isCloud && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-content-muted">
                    {servers.length > 0
                      ? "Select a registered server below, or add a new one."
                      : "No servers loaded yet — refresh or register an EC2 instance."}
                  </p>
                  <Button variant="ghost" size="sm" disabled={serversLoading} onClick={() => void loadServers()}>
                    {serversLoading ? "Refreshing…" : "Refresh list"}
                  </Button>
                </div>
                {!showAddServer ? (
                  <Button variant="secondary" size="sm" onClick={() => setShowAddServer(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    Add EC2 / remote server
                  </Button>
                ) : (
                  <AddServerPanel
                    form={serverForm}
                    setField={setServerField}
                    registering={registering}
                    registerError={registerError}
                    onCancel={() => setShowAddServer(false)}
                    onRegister={registerServer}
                  />
                )}
              </>
            )}

            {isCloud && (
              <>
                {(needsSplitServers || form.hosting === "cloud-single") && (
                  <Field label={needsSplitServers ? "Staging server" : "Server"}>
                    <ServerSelect
                      servers={servers.filter((s) => !s.platform)}
                      value={form.stagingServerUuid}
                      onClear={
                        form.stagingServerUuid
                          ? () => {
                              set({ stagingServerUuid: "" });
                              setServerVal((prev) => {
                                const next = { ...prev };
                                delete next[form.stagingServerUuid];
                                return next;
                              });
                            }
                          : undefined
                      }
                      onChange={(v) => {
                        set({
                          stagingServerUuid: v,
                          productionServerUuid: form.hosting === "cloud-single" ? v : form.productionServerUuid,
                        });
                        if (v) void validateServerUuid(v);
                      }}
                    />
                    {form.stagingServerUuid && (
                      <ServerValidationRow
                        label={needsSplitServers ? "Staging validation" : "Server validation"}
                        uuid={form.stagingServerUuid}
                        state={serverVal[form.stagingServerUuid]}
                        onRevalidate={() => validateServerUuid(form.stagingServerUuid)}
                      />
                    )}
                  </Field>
                )}
                {needsSplitServers && (
                  <Field label="Production server (optional)">
                    <ServerSelect
                      servers={servers.filter((s) => !s.platform)}
                      value={form.productionServerUuid}
                      onClear={
                        form.productionServerUuid
                          ? () => {
                              set({ productionServerUuid: "" });
                              setServerVal((prev) => {
                                const next = { ...prev };
                                delete next[form.productionServerUuid];
                                return next;
                              });
                            }
                          : undefined
                      }
                      onChange={(v) => {
                        set({ productionServerUuid: v });
                        if (v) void validateServerUuid(v);
                      }}
                    />
                    {form.productionServerUuid && (
                      <ServerValidationRow
                        label="Production validation"
                        uuid={form.productionServerUuid}
                        state={serverVal[form.productionServerUuid]}
                        onRevalidate={() => validateServerUuid(form.productionServerUuid)}
                      />
                    )}
                  </Field>
                )}
                <Field label="Exposed port">
                  <Input value={form.portsExposes} onChange={(v) => set({ portsExposes: v })} placeholder="3000" />
                </Field>
                <Field label="Build pack">
                  <select
                    value={form.buildPack}
                    onChange={(e) => set({ buildPack: e.target.value as BuildPack })}
                    className="h-9 w-full rounded-lg border border-border-subtle bg-surface-base px-2.5 text-sm text-content-primary outline-none focus:border-border-strong"
                  >
                    <option value="dockercompose">Docker Compose</option>
                    <option value="nixpacks">Nixpacks</option>
                    <option value="dockerfile">Dockerfile</option>
                    <option value="static">Static</option>
                    <option value="railpack">Railpack</option>
                  </select>
                </Field>
              </>
            )}
          </div>
        )}

        {step === 6 && (
          <ReconcileStep
            tenantSlug={tenantSlug}
            hosting={form.hosting}
            servers={reconcileTargets}
            appPort={form.portsExposes}
          />
        )}

        {step === 7 && (
          <div className="space-y-3">
            <p className="text-xs text-content-muted">
              Variables from your gitignored <span className="font-mono">.env</span> — stored encrypted in Praxarch
              and injected into Coolify at provision time. Never committed to git.
            </p>
            {needsSplitServers ? (
              <>
                <Field label="Staging environment variables">
                  <EnvTextarea
                    value={form.stagingEnvText}
                    onChange={(v) => set({ stagingEnvText: v })}
                    placeholder={"MONGO_URI=mongodb://...\nJWT_SECRET=..."}
                  />
                </Field>
                <Field label="Production environment variables">
                  <EnvTextarea
                    value={form.productionEnvText}
                    onChange={(v) => set({ productionEnvText: v })}
                    placeholder={"MONGO_URI=mongodb://...\nJWT_SECRET=..."}
                  />
                </Field>
              </>
            ) : (
              <Field label="Environment variables (staging + production)">
                <EnvTextarea
                  value={form.stagingEnvText}
                  onChange={(v) => set({ stagingEnvText: v, productionEnvText: v })}
                  placeholder={"MONGO_URI=mongodb://...\nAPI_KEY=..."}
                />
              </Field>
            )}
            <p className="text-[11px] text-content-muted">Optional — skip if your repo supplies all config.</p>
          </div>
        )}

        {step === 8 && (
          <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-base p-3 text-sm">
            <ReviewRow k="Hosting" v={hostingDef.label} />
            <ReviewRow k="Stack" v={typeDef.label} />
            <ReviewRow k="Name" v={form.name} />
            <ReviewRow k="Repo" v={form.repo} />
            <ReviewRow k="Staging branch" v={form.stagingBranch} />
            <ReviewRow k="Production branch" v={form.productionBranch} />
            <ReviewRow k="Build pack" v={form.buildPack} />
            <ReviewRow k="Port" v={form.portsExposes} />
            <ReviewRow
              k="Staging server"
              v={servers.find((s) => s.uuid === form.stagingServerUuid)?.name ?? "—"}
            />
            {needsSplitServers && (
              <ReviewRow
                k="Production server"
                v={
                  form.productionServerUuid
                    ? (servers.find((s) => s.uuid === form.productionServerUuid)?.name ?? "—")
                    : "Not configured (add later)"
                }
              />
            )}
            <ReviewRow k="Git access" v={form.accessVerified ? "verified" : form.githubToken ? "token set" : "public"} />
            <ReviewRow
              k="Env secrets"
              v={
                form.stagingEnvText.trim() || form.productionEnvText.trim()
                  ? "will be injected"
                  : "none (repo config)"
              }
            />
          </div>
        )}
      </div>
        </>
      )}
    </AppModal>
  );
}

interface ReconcileTarget {
  uuid: string;
  label: string;
  host: string | null;
  role: string;
}

interface PreflightConflict {
  kind: "legacy-container" | "port" | "proxy" | "data-volume";
  severity: "block" | "warn" | "info";
  message: string;
  target?: string;
}

interface PreflightContainer {
  name: string;
  image: string;
  publishedPorts: string[];
  status: string;
  coolifyManaged: boolean;
}

interface PreflightReport {
  serverUuid: string;
  host: string | null;
  reachable: boolean;
  scanError?: string;
  proxyOwner: "nginx" | "traefik" | "caddy" | "apache" | "other" | "none";
  proxyHolder80: string | null;
  proxyHolder443: string | null;
  containers: PreflightContainer[];
  volumes: string[];
  conflicts: PreflightConflict[];
  suggestedStopContainers: string[];
  nginxRoutes?: Array<{ location: string; port: number; listening: boolean }>;
}

/**
 * Reconcile step — scans each target server (read-only) for takeover conflicts and
 * lets the user opt in to stopping legacy containers / handing the proxy to nginx.
 * Greenfield servers show "nothing to reconcile".
 */
function ReconcileStep({
  tenantSlug,
  hosting,
  servers,
  appPort,
}: {
  tenantSlug: string;
  hosting: HostingTopology;
  servers: ReconcileTarget[];
  appPort: string;
}) {
  if (hosting === "local") {
    return (
      <p className="rounded-lg border border-border-subtle bg-surface-base px-3 py-4 text-sm text-content-muted">
        Reconcile is skipped for the shared platform localhost — Praxarch never modifies the shared
        host on your behalf.
      </p>
    );
  }
  if (servers.length === 0) {
    return (
      <p className="rounded-lg border border-border-subtle bg-surface-base px-3 py-4 text-sm text-content-muted">
        No validated server selected yet. Go back to <span className="text-content-secondary">Targets</span> to
        pick one, then return here to scan it for conflicts.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-content-muted">
        Before Coolify takes over, Praxarch scans each server (read-only) for anything already using the
        ports or reverse proxy. Removing a legacy container <strong>preserves its data volumes</strong>. Nothing
        is changed unless you tick it and confirm.
      </p>
      {servers.map((s) => (
        <ReconcileServerCard key={s.uuid} tenantSlug={tenantSlug} server={s} appPort={appPort} />
      ))}
    </div>
  );
}

function ReconcileServerCard({
  tenantSlug,
  server,
  appPort,
}: {
  tenantSlug: string;
  server: ReconcileTarget;
  appPort: string;
}) {
  const [report, setReport] = useState<PreflightReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [setProxyNone, setSetProxyNone] = useState(false);
  const [retargetNginx, setRetargetNginx] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const scannedRef = useRef(false);

  async function scan() {
    setScanning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/bff/cicd/coolify/servers/${encodeURIComponent(server.uuid)}/preflight`,
        { method: "POST", headers: { "x-praxarch-tenant": tenantSlug } }
      );
      const data = (await res.json().catch(() => ({}))) as PreflightReport & { message?: string };
      if (!res.ok) throw new Error(parseApiError(data, `Scan failed (${res.status})`));
      setReport(data);
      setSelected(new Set(data.suggestedStopContainers ?? []));
      setSetProxyNone(data.proxyOwner === "nginx" || data.proxyOwner === "caddy" || data.proxyOwner === "apache");
      const deadNginx = (data.nginxRoutes ?? []).some((r) => !r.listening);
      setRetargetNginx(deadNginx && Boolean(appPort.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function reconcile() {
    setReconciling(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/bff/cicd/coolify/servers/${encodeURIComponent(server.uuid)}/reconcile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-praxarch-tenant": tenantSlug },
          body: JSON.stringify({
            stopContainers: [...selected],
            setProxyNone,
            ...(retargetNginx && appPort.trim()
              ? { retargetDeadNginxUpstreamsTo: parseInt(appPort, 10) }
              : {}),
          }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        stopped?: string[];
        failed?: { target: string; error: string }[];
        proxySetNone?: boolean;
        proxyMessage?: string;
        nginxRetargeted?: number[];
        nginxMessage?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(parseApiError(data, `Reconcile failed (${res.status})`));
      const parts: string[] = [];
      if (data.stopped?.length) parts.push(`Removed ${data.stopped.join(", ")}`);
      if (data.proxySetNone) parts.push("Coolify proxy set to none");
      if (data.proxyMessage) parts.push(data.proxyMessage);
      if (data.nginxRetargeted?.length) {
        parts.push(`nginx upstream ${data.nginxRetargeted.join(", ")} → ${appPort}`);
      } else if (data.nginxMessage) parts.push(data.nginxMessage);
      if (data.failed?.length) parts.push(`Failed: ${data.failed.map((f) => f.target).join(", ")}`);
      setResult(parts.join(" · ") || "Nothing to do");
      await scan();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reconcile failed");
    } finally {
      setReconciling(false);
    }
  }

  const blockers = report?.conflicts.filter((c) => c.severity === "block") ?? [];
  const legacyContainers = (report?.containers ?? []).filter(
    (c) => !c.coolifyManaged && c.name !== "coolify-proxy" && c.name !== "coolify-sentinel"
  );
  const hasDeadNginx = (report?.nginxRoutes ?? []).some((r) => !r.listening);
  const hasActions = selected.size > 0 || setProxyNone || retargetNginx;

  return (
    <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-base p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-content-primary">
            {server.role}
            <span className="ml-1.5 font-normal text-content-muted">
              {server.label}
              {server.host ? ` · ${server.host}` : ""}
            </span>
          </div>
          <div className="text-[11px] text-content-muted">
            {scanning
              ? "Scanning server (read-only)…"
              : report
                ? report.scanError
                  ? "Scan error"
                  : blockers.length > 0
                    ? `${blockers.length} conflict${blockers.length > 1 ? "s" : ""} to reconcile`
                    : "No blocking conflicts — ready for Coolify"
                : "Not scanned yet"}
          </div>
        </div>
        <Button variant="ghost" size="sm" disabled={scanning || reconciling} onClick={scan}>
          {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {scanning ? "Scanning…" : "Re-scan"}
        </Button>
      </div>

      {error && <p className="text-xs text-status-error">{error}</p>}
      {report?.scanError && (
        <p className="text-xs text-status-error">
          Could not scan over SSH: {report.scanError}
        </p>
      )}

      {report && !report.scanError && (
        <>
          {report.conflicts.map((c, i) => (
            <div
              key={`${c.kind}-${i}`}
              className={cn(
                "flex items-start gap-2 rounded-md px-2.5 py-1.5 text-[11px]",
                c.severity === "block"
                  ? "bg-status-error/10 text-status-error"
                  : c.severity === "warn"
                    ? "bg-status-pending/10 text-status-pending"
                    : "bg-surface-overlay text-content-muted"
              )}
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{c.message}</span>
            </div>
          ))}

          {legacyContainers.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-medium text-content-secondary">
                Legacy containers (tick to stop &amp; remove — data volumes preserved)
              </div>
              {legacyContainers.map((c) => (
                <label
                  key={c.name}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border-subtle px-2.5 py-1.5 text-[11px] text-content-secondary hover:bg-surface-overlay"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.name)}
                    onChange={() => toggle(c.name)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="font-mono text-content-primary">{c.name}</span>
                  <span className="truncate text-content-muted">{c.image}</span>
                  {c.publishedPorts.length > 0 && (
                    <span className="ml-auto shrink-0 font-mono text-content-muted">
                      {c.publishedPorts.join(", ")}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}

          {(report.proxyOwner === "nginx" ||
            report.proxyOwner === "caddy" ||
            report.proxyOwner === "apache") && (
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border-subtle px-2.5 py-1.5 text-[11px] text-content-secondary hover:bg-surface-overlay">
              <input
                type="checkbox"
                checked={setProxyNone}
                onChange={(e) => setSetProxyNone(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Keep {report.proxyHolder443 ?? report.proxyHolder80 ?? "existing proxy"} as the front door
              (set Coolify proxy to <span className="font-mono">none</span>)
            </label>
          )}

          {hasDeadNginx && appPort.trim() && (
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border-subtle px-2.5 py-1.5 text-[11px] text-content-secondary hover:bg-surface-overlay">
              <input
                type="checkbox"
                checked={retargetNginx}
                onChange={(e) => setRetargetNginx(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Retarget dead nginx upstream ports to Coolify app port{" "}
              <span className="font-mono">{appPort}</span> (fixes 502 on /2, agreeatime, etc.)
            </label>
          )}

          {result && <p className="text-[11px] text-status-active">{result}</p>}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-content-muted">
              {hasActions
                ? "These changes run only when you click Reconcile."
                : "Nothing selected — safe to continue."}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!hasActions || reconciling || scanning}
              onClick={reconcile}
            >
              {reconciling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {reconciling ? "Reconciling…" : "Reconcile server"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ServerValidationRow({
  label,
  uuid,
  state,
  onRevalidate,
}: {
  label: string;
  uuid: string;
  state?: { status: ServerValStatus; message?: string };
  onRevalidate: () => void;
}) {
  const status = state?.status ?? "idle";
  return (
    <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-base px-3 py-2">
      <div>
        <div className="text-xs font-medium text-content-primary">{label}</div>
        <div className="text-[11px] text-content-muted">
          {status === "valid" && (state?.message ?? "Validated")}
          {status === "invalid" && (state?.message ?? "Validation failed")}
          {status === "checking" && "Checking SSH and Docker (read-only — Praxarch will not change the server)…"}
          {status === "idle" && "Not validated yet"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {status === "valid" && <Check className="h-4 w-4 text-status-active" />}
        {status === "invalid" && <AlertCircle className="h-4 w-4 text-status-error" />}
        {status === "checking" && <Loader2 className="h-4 w-4 animate-spin text-content-muted" />}
        {status !== "checking" && (
          <Button variant="ghost" size="sm" onClick={onRevalidate}>
            {status === "valid" ? "Re-check" : "Validate"}
          </Button>
        )}
      </div>
    </div>
  );
}

function AddServerPanel({
  form,
  setField,
  registering,
  registerError,
  onCancel,
  onRegister,
}: {
  form: AddServerForm;
  setField: (p: Partial<AddServerForm>) => void;
  registering: boolean;
  registerError: string | null;
  onCancel: () => void;
  onRegister: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-base p-3">
      <div className="text-xs font-medium text-content-primary">Register a deployment server</div>
      <Field label="Display name">
        <Input value={form.name} onChange={(v) => setField({ name: v })} placeholder="staging-ec2" />
      </Field>
      <Field label="Host (IP or DNS)">
        <Input value={form.host} onChange={(v) => setField({ host: v })} placeholder="203.0.113.10" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="SSH port">
          <Input value={form.port} onChange={(v) => setField({ port: v })} placeholder="22" />
        </Field>
        <Field label="SSH user">
          <Input value={form.user} onChange={(v) => setField({ user: v })} placeholder="ubuntu" />
        </Field>
      </div>
      <Field label="SSH private key (OpenSSH / PEM)">
        <p className="mb-1.5 text-[11px] text-content-muted">
          Do <strong>not</strong> paste the public key from the top of PuTTYgen (
          <span className="font-mono">ssh-rsa AAAA…</span>). Use{" "}
          <span className="font-mono">Conversions → Export OpenSSH key</span>, save the file, open in Notepad,
          and paste the block starting with <span className="font-mono">-----BEGIN … PRIVATE KEY-----</span>.
          The same private key can be used for staging and production if both instances accept it.
        </p>
        <textarea
          value={form.sshPrivateKey}
          onChange={(e) => setField({ sshPrivateKey: e.target.value })}
          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
          rows={4}
          className="max-h-32 w-full resize-none overflow-y-auto rounded-lg border border-border-subtle bg-surface-base px-2.5 py-2 font-mono text-xs text-content-primary outline-none focus:border-border-strong"
        />
        <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[11px] text-content-muted hover:text-content-secondary">
          <input
            type="file"
            accept=".pem,.key,text/plain"
            className="text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === "string") setField({ sshPrivateKey: reader.result });
              };
              reader.readAsText(file);
              e.target.value = "";
            }}
          />
          Upload .pem / .key file
        </label>
      </Field>
      {registerError && <p className="text-xs text-status-error">{registerError}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={registering || !form.name.trim() || !form.host.trim() || !form.sshPrivateKey.trim()}
          onClick={onRegister}
        >
          {registering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {registering ? "Registering…" : "Register & validate"}
        </Button>
      </div>
    </div>
  );
}

function ServerSelect({
  servers,
  value,
  onChange,
  onClear,
  disabled,
}: {
  servers: CoolifyServerOption[];
  value: string;
  onChange: (uuid: string) => void;
  onClear?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-base px-2.5 text-sm text-content-primary outline-none focus:border-border-strong disabled:opacity-60"
      >
        <option value="">Select a server…</option>
        {servers.map((s) => (
          <option key={s.uuid} value={s.uuid}>
            {s.name}
            {s.host ? ` · ${s.host}` : ""}
            {s.platform ? " (local)" : ""}
            {!s.platform && (!s.reachable || !s.usable) ? " · needs validation" : ""}
          </option>
        ))}
      </select>
      {onClear && (
        <Button type="button" variant="ghost" size="sm" onClick={onClear} className="shrink-0">
          Clear
        </Button>
      )}
    </div>
  );
}

function EnvTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      rows={5}
      className="max-h-40 w-full resize-none overflow-y-auto rounded-lg border border-border-subtle bg-surface-base px-2.5 py-2 font-mono text-xs text-content-primary outline-none focus:border-border-strong"
    />
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
    <div className="flex items-center justify-between gap-4">
      <span className="text-content-muted">{k}</span>
      <span className="truncate font-mono text-content-secondary">{v}</span>
    </div>
  );
}
