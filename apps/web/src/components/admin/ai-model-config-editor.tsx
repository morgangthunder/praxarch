"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppModal } from "@/components/ui/app-modal";
import { cn } from "@/lib/utils";

type ModelTier = "recommended" | "fast" | "reasoning" | "specialist" | "legacy";

interface ModelOption {
  id: string;
  label: string;
  hint?: string;
  tier: ModelTier;
}

interface ProviderMeta {
  id: string;
  label: string;
  defaultBaseUrl: string;
  models: ModelOption[];
  modelsSource?: "live" | "catalog";
  configured: boolean;
}

const TIER_LABELS: Record<ModelTier, string> = {
  recommended: "Recommended",
  fast: "Fast",
  reasoning: "Reasoning",
  specialist: "Specialist",
  legacy: "Legacy / other",
};

interface ContextFieldMeta {
  key: string;
  label: string;
  description: string;
}

interface PromptOption {
  key: string;
  label: string;
  scope: string;
  source: string;
}

interface AssistantCase {
  caseKey: string;
  label: string;
  description: string | null;
  modelProvider: string;
  modelId: string;
  apiBaseUrl: string | null;
  guardrailPromptKey: string;
  behaviorPromptKey: string;
  contextFields: Record<string, boolean>;
  providerConfigured?: boolean;
}

/**
 * Super-admin AI model configuration. Each "case" (use-case) has its own
 * provider, model, associated guardrail/behavior prompts, and context toggles.
 */
export function AiModelConfigEditor() {
  const [cases, setCases] = useState<AssistantCase[]>([]);
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [contextFields, setContextFields] = useState<ContextFieldMeta[]>([]);
  const [guardrailPrompts, setGuardrailPrompts] = useState<PromptOption[]>([]);
  const [behaviorPrompts, setBehaviorPrompts] = useState<PromptOption[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<AssistantCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupModal, setDupModal] = useState<{ scope: "guardrail" | "chat"; fromKey: string } | null>(null);
  const [dupLabel, setDupLabel] = useState("");
  const [customModel, setCustomModel] = useState(false);

  const activeProvider = useMemo(
    () => providers.find((p) => p.id === draft?.modelProvider),
    [providers, draft?.modelProvider]
  );

  const modelInCatalog = useMemo(
    () => activeProvider?.models.some((m) => m.id === draft?.modelId) ?? false,
    [activeProvider, draft?.modelId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [metaRes, casesRes, guardRes, chatRes] = await Promise.all([
        fetch("/api/bff/admin/ai-cases/meta", { cache: "no-store" }),
        fetch("/api/bff/admin/ai-cases", { cache: "no-store" }),
        fetch("/api/bff/admin/prompts?scope=guardrail", { cache: "no-store" }),
        fetch("/api/bff/admin/prompts?scope=chat", { cache: "no-store" }),
      ]);
      if (!metaRes.ok || !casesRes.ok) throw new Error("Failed to load AI case config");

      const meta = (await metaRes.json()) as {
        providers: ProviderMeta[];
        contextFields: ContextFieldMeta[];
      };
      const casesData = (await casesRes.json()) as { cases: AssistantCase[] };
      const guardData = guardRes.ok ? ((await guardRes.json()) as { prompts: PromptOption[] }) : { prompts: [] };
      const chatData = chatRes.ok ? ((await chatRes.json()) as { prompts: PromptOption[] }) : { prompts: [] };

      setProviders(meta.providers);
      setContextFields(meta.contextFields);
      setCases(casesData.cases);
      setGuardrailPrompts(guardData.prompts);
      setBehaviorPrompts(chatData.prompts);

      const first = casesData.cases[0];
      setSelectedKey((k) => k ?? first?.caseKey ?? null);
      const initial = first ?? null;
      setDraft((d) => d ?? initial);
      if (initial) {
        const provider = meta.providers.find((p) => p.id === initial.modelProvider);
        const known = provider?.models.some((m) => m.id === initial.modelId) ?? false;
        setCustomModel(!known);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Saved model not in catalogue → show custom ID field. */
  useEffect(() => {
    if (!draft || !activeProvider) return;
    const known = activeProvider.models.some((m) => m.id === draft.modelId);
    setCustomModel(!known);
  }, [draft?.modelId, draft?.modelProvider, activeProvider]);

  const selected = cases.find((c) => c.caseKey === selectedKey) ?? null;
  const dirty = selected && draft ? JSON.stringify(selected) !== JSON.stringify(draft) : false;
  const selectedModelHint = activeProvider?.models.find((m) => m.id === draft?.modelId)?.hint;

  const selectCase = (c: AssistantCase) => {
    setSelectedKey(c.caseKey);
    setDraft({ ...c, contextFields: { ...c.contextFields } });
    const provider = providers.find((p) => p.id === c.modelProvider);
    const known = provider?.models.some((m) => m.id === c.modelId) ?? false;
    setCustomModel(!known);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/bff/admin/ai-cases/${encodeURIComponent(draft.caseKey)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: draft.label,
          description: draft.description,
          modelProvider: draft.modelProvider,
          modelId: draft.modelId,
          apiBaseUrl: draft.apiBaseUrl || null,
          guardrailPromptKey: draft.guardrailPromptKey,
          behaviorPromptKey: draft.behaviorPromptKey,
          contextFields: draft.contextFields,
        }),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(detail.message ?? `Save failed (${res.status})`);
      }
      const updated = (await res.json()) as AssistantCase;
      setCases((cs) => cs.map((c) => (c.caseKey === updated.caseKey ? updated : c)));
      setDraft({ ...updated, contextFields: { ...updated.contextFields } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const duplicatePrompt = async () => {
    if (!dupModal || !dupLabel.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/bff/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: dupLabel.trim(),
          scope: dupModal.scope,
          duplicateFrom: dupModal.fromKey,
        }),
      });
      if (!res.ok) throw new Error(`Duplicate failed (${res.status})`);
      const created = (await res.json()) as PromptOption;
      if (dupModal.scope === "guardrail") {
        setGuardrailPrompts((p) => [...p, created]);
        setDraft((d) => (d ? { ...d, guardrailPromptKey: created.key } : d));
      } else {
        setBehaviorPrompts((p) => [...p, created]);
        setDraft((d) => (d ? { ...d, behaviorPromptKey: created.key } : d));
      }
      setDupModal(null);
      setDupLabel("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Card className="p-6 text-sm text-content-muted">Loading AI model config…</Card>;
  }

  return (
    <div className="space-y-3">
      {error && (
        <Card className="border-status-error/40 p-3 text-sm text-status-error">{error}</Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Case list */}
        <Card className="lg:col-span-1">
          <div className="border-b border-border-subtle px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-content-muted">
            Assistant cases
          </div>
          <div className="divide-y divide-border-subtle">
            {cases.map((c) => (
              <button
                key={c.caseKey}
                onClick={() => selectCase(c)}
                className={cn(
                  "flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors",
                  c.caseKey === selectedKey ? "bg-surface-overlay" : "hover:bg-surface-overlay/60"
                )}
              >
                <span className="text-sm font-medium text-content-primary">{c.label}</span>
                <span className="font-mono text-[11px] text-content-muted">{c.caseKey}</span>
                <span className="text-[11px] text-content-secondary">
                  {c.modelProvider} / {c.modelId}
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-border-subtle px-4 py-2 text-[11px] text-content-muted">
            More cases can be added as new AI surfaces ship.
          </div>
        </Card>

        {/* Case editor */}
        {draft && (
          <Card className="flex flex-col lg:col-span-2">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-content-primary">{draft.label}</div>
                <div className="font-mono text-[11px] text-content-muted">{draft.caseKey}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!dirty || saving}
                  onClick={() => selected && selectCase(selected)}
                >
                  Revert
                </Button>
                <Button variant="primary" size="sm" disabled={!dirty || saving} onClick={save}>
                  {saving ? "Saving…" : dirty ? "Save" : "Saved"}
                </Button>
              </div>
            </div>

            <div className="space-y-5 p-4">
              {/* Model */}
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-content-muted">
                  Model
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-content-secondary">Provider</span>
                    <select
                      value={draft.modelProvider}
                      onChange={(e) => {
                        const p = providers.find((x) => x.id === e.target.value);
                        setDraft({
                          ...draft,
                          modelProvider: e.target.value,
                          modelId: p?.models[0]?.id ?? draft.modelId,
                          apiBaseUrl: null,
                        });
                      }}
                      className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-sm"
                    >
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                          {p.configured ? "" : " (no API key)"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="block text-sm">
                    <span className="mb-1 block text-content-secondary">Model</span>
                    {!customModel && modelInCatalog ? (
                      <select
                        value={draft.modelId}
                        onChange={(e) => {
                          if (e.target.value === "__custom__") {
                            setCustomModel(true);
                            return;
                          }
                          setDraft({ ...draft, modelId: e.target.value });
                        }}
                        className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-sm"
                      >
                        {(["recommended", "fast", "reasoning", "specialist", "legacy"] as ModelTier[]).map(
                          (tier) => {
                            const group = activeProvider?.models.filter((m) => m.tier === tier) ?? [];
                            if (!group.length) return null;
                            return (
                              <optgroup key={tier} label={TIER_LABELS[tier]}>
                                {group.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.label} ({m.id})
                                  </option>
                                ))}
                              </optgroup>
                            );
                          }
                        )}
                        <option value="__custom__">Custom model ID…</option>
                      </select>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          value={draft.modelId}
                          onChange={(e) => setDraft({ ...draft, modelId: e.target.value })}
                          className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-base px-3 py-2 font-mono text-sm"
                          placeholder="e.g. grok-4.20-0309-non-reasoning"
                        />
                        {activeProvider?.models.length ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCustomModel(false)}
                          >
                            Pick from list
                          </Button>
                        ) : null}
                      </div>
                    )}
                    {selectedModelHint && (
                      <p className="mt-1.5 text-[11px] text-content-muted">{selectedModelHint}</p>
                    )}
                    {activeProvider?.modelsSource === "live" && (
                      <p className="mt-1 text-[11px] text-status-active">
                        Models loaded live from your {activeProvider.label} API key.
                      </p>
                    )}
                  </div>
                  <label className="block text-sm sm:col-span-2">
                    <span className="mb-1 block text-content-secondary">
                      API base URL <span className="text-content-muted">(optional override)</span>
                    </span>
                    <input
                      value={draft.apiBaseUrl ?? ""}
                      placeholder={activeProvider?.defaultBaseUrl ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, apiBaseUrl: e.target.value.trim() || null })
                      }
                      className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2 font-mono text-sm"
                    />
                  </label>
                </div>
                {!activeProvider?.configured && (
                  <p className="mt-2 text-xs text-status-pending">
                    No API key for {activeProvider?.label}. Set{" "}
                    {activeProvider?.id === "xai" ? "GROK_API_KEY" : "OPENAI_API_KEY"} in .env — assistant
                    falls back to placeholder mode.
                  </p>
                )}
              </section>

              {/* Prompts */}
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-content-muted">
                  Associated prompts
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <PromptSelect
                    label="Guardrail prompt"
                    value={draft.guardrailPromptKey}
                    options={guardrailPrompts}
                    onChange={(key) => setDraft({ ...draft, guardrailPromptKey: key })}
                    onDuplicate={(fromKey) => {
                      setDupModal({ scope: "guardrail", fromKey });
                      setDupLabel("");
                    }}
                  />
                  <PromptSelect
                    label="Behavior / persona prompt"
                    value={draft.behaviorPromptKey}
                    options={behaviorPrompts}
                    onChange={(key) => setDraft({ ...draft, behaviorPromptKey: key })}
                    onDuplicate={(fromKey) => {
                      setDupModal({ scope: "chat", fromKey });
                      setDupLabel("");
                    }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-content-muted">
                  Edit prompt bodies in{" "}
                  <Link href="/admin/prompts" className="text-content-secondary underline">
                    Prompt Registry
                  </Link>
                  . Duplicate here to fork a starter, then associate it above.
                </p>
              </section>

              {/* Context toggles */}
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-content-muted">
                  Context block — include on each turn
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {contextFields.map((f) => (
                    <label
                      key={f.key}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border border-border-subtle px-3 py-2 hover:bg-surface-overlay/40"
                    >
                      <input
                        type="checkbox"
                        checked={!!draft.contextFields[f.key]}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            contextFields: { ...draft.contextFields, [f.key]: e.target.checked },
                          })
                        }
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block text-sm text-content-primary">{f.label}</span>
                        <span className="block text-[11px] text-content-muted">{f.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            </div>
          </Card>
        )}
      </div>

      {/* Duplicate prompt modal */}
      {dupModal && (
        <AppModal
          title="Duplicate prompt"
          onClose={() => setDupModal(null)}
          maxWidth="md"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDupModal(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!dupLabel.trim() || saving}
                onClick={duplicatePrompt}
              >
                Create &amp; select
              </Button>
            </div>
          }
        >
          <p className="text-xs text-content-muted">
            Creates a new custom prompt seeded from the selected one. You can edit the body in Prompt
            Registry after saving.
          </p>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-content-secondary">New prompt label</span>
            <input
              value={dupLabel}
              onChange={(e) => setDupLabel(e.target.value)}
              placeholder="e.g. Stricter deploy guardrails"
              className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-sm"
              autoFocus
            />
          </label>
        </AppModal>
      )}
    </div>
  );
}

function PromptSelect({
  label,
  value,
  options,
  onChange,
  onDuplicate,
}: {
  label: string;
  value: string;
  options: PromptOption[];
  onChange: (key: string) => void;
  onDuplicate: (fromKey: string) => void;
}) {
  return (
    <div className="text-sm">
      <span className="mb-1 block text-content-secondary">{label}</span>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-sm"
        >
          {options.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label} ({p.source})
            </option>
          ))}
        </select>
        <Button variant="ghost" size="sm" onClick={() => onDuplicate(value)} title="Duplicate as new prompt">
          Duplicate
        </Button>
      </div>
    </div>
  );
}
