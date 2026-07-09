"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppModal } from "@/components/ui/app-modal";
import { cn } from "@/lib/utils";

interface PromptEntry {
  key: string;
  label: string;
  scope: "guardrail" | "chat" | "strategist" | "creative" | "analyst" | "buyer";
  live: boolean;
  version: number;
  body: string;
  source: "builtin" | "override" | "custom";
  customised: boolean;
  updatedAt: string | null;
}

/**
 * Super-admin editor for the platform-wide assistant prompts. Reads live data
 * from the API (built-in defaults merged with persisted overrides) and saves
 * new versions. The guardrail + persona prompts are prepended to every
 * assistant turn alongside the auto-generated context block and tool catalogue.
 */
export function PromptRegistryEditor() {
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newScope, setNewScope] = useState<PromptEntry["scope"]>("guardrail");
  const [duplicateFromKey, setDuplicateFromKey] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bff/admin/prompts", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load prompts (${res.status})`);
      const data = (await res.json()) as { prompts: PromptEntry[] };
      setPrompts(data.prompts);
      setDrafts(Object.fromEntries(data.prompts.map((p) => [p.key, p.body])));
      setSelectedKey((k) => k ?? data.prompts[0]?.key ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = prompts.find((p) => p.key === selectedKey) ?? null;
  const dirty = selected ? drafts[selected.key] !== selected.body : false;

  const createPrompt = async () => {
    if (!newLabel.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/bff/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel.trim(),
          scope: newScope,
          ...(duplicateFromKey ? { duplicateFrom: duplicateFromKey } : {}),
        }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      const created = (await res.json()) as PromptEntry;
      setPrompts((ps) => [...ps, created].sort((a, b) => a.label.localeCompare(b.label)));
      setDrafts((d) => ({ ...d, [created.key]: created.body }));
      setSelectedKey(created.key);
      setCreateOpen(false);
      setNewLabel("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/bff/admin/prompts/${encodeURIComponent(selected.key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: drafts[selected.key] }),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(detail.message ?? `Save failed (${res.status})`);
      }
      const updated = (await res.json()) as PromptEntry;
      setPrompts((ps) => ps.map((p) => (p.key === updated.key ? updated : p)));
      setDrafts((d) => ({ ...d, [updated.key]: updated.body }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Card className="p-6 text-sm text-content-muted">Loading prompts…</Card>;
  }

  return (
    <div className="space-y-3">
      {error && (
        <Card className="border-status-error/40 p-3 text-sm text-status-error">{error}</Card>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Prompt list */}
        <Card className="lg:col-span-1">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
            <span className="text-xs font-medium uppercase tracking-wide text-content-muted">Prompts</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDuplicateFromKey(undefined);
                setNewLabel("");
                setNewScope("guardrail");
                setCreateOpen(true);
              }}
            >
              New
            </Button>
          </div>
          <div className="divide-y divide-border-subtle">
            {prompts.map((p) => (
              <button
                key={p.key}
                onClick={() => setSelectedKey(p.key)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors",
                  p.key === selectedKey ? "bg-surface-overlay" : "hover:bg-surface-overlay/60"
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-content-primary">{p.label}</span>
                    {p.live ? (
                      <span className="rounded bg-status-active/15 px-1.5 py-0.5 text-[10px] font-medium text-status-active">
                        live
                      </span>
                    ) : (
                      <span className="rounded bg-surface-overlay px-1.5 py-0.5 text-[10px] text-content-muted">
                        stored
                      </span>
                    )}
                  </div>
                  <div className="truncate font-mono text-[11px] text-content-muted">{p.key}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs text-content-secondary">v{p.version}</div>
                  <div className="text-[11px] text-content-muted">{p.source}</div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Editor */}
        {selected && (
          <Card className="flex flex-col lg:col-span-2">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-content-primary">{selected.label}</div>
                <div className="font-mono text-[11px] text-content-muted">
                  {selected.key} · v{selected.version}
                  {selected.live ? " · applied to every assistant turn" : " · stored (not yet wired to a live agent)"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDuplicateFromKey(selected.key);
                    setNewLabel(`${selected.label} (copy)`);
                    setNewScope(selected.scope);
                    setCreateOpen(true);
                  }}
                >
                  Duplicate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!dirty || saving}
                  onClick={() => setDrafts((d) => ({ ...d, [selected.key]: selected.body }))}
                >
                  Revert
                </Button>
                <Button variant="primary" size="sm" disabled={!dirty || saving} onClick={save}>
                  {saving ? "Saving…" : dirty ? `Save v${selected.version + 1}` : "Saved"}
                </Button>
              </div>
            </div>
            <textarea
              value={drafts[selected.key] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [selected.key]: e.target.value }))}
              spellCheck={false}
              className="min-h-[320px] flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-relaxed text-content-primary outline-none"
            />
            <div className="border-t border-border-subtle px-4 py-2 text-[11px] text-content-muted">
              {selected.scope === "guardrail"
                ? "Guardrails are highest-priority. Associate prompts with assistant cases in "
                : "Associate behavior prompts with cases in "}
              <Link href="/admin/ai-models" className="underline">
                AI Models
              </Link>
              .
            </div>
          </Card>
        )}
      </div>

      {createOpen && (
        <AppModal
          title="New custom prompt"
          onClose={() => setCreateOpen(false)}
          maxWidth="md"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!newLabel.trim() || saving}
                onClick={createPrompt}
              >
                {duplicateFromKey ? "Duplicate & create" : "Create"}
              </Button>
            </div>
          }
        >
          <label className="block text-sm">
            <span className="mb-1 block text-content-secondary">Label</span>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-sm"
              autoFocus
            />
          </label>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-content-secondary">Scope</span>
            <select
              value={newScope}
              onChange={(e) => setNewScope(e.target.value as PromptEntry["scope"])}
              className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-sm"
            >
              <option value="guardrail">Guardrail</option>
              <option value="chat">Behavior / chat</option>
              <option value="strategist">Strategist agent</option>
              <option value="creative">Creative agent</option>
            </select>
          </label>
        </AppModal>
      )}
    </div>
  );
}
