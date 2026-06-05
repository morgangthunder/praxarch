"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PromptEntry {
  id: string;
  key: string;
  label: string;
  scope: "strategist" | "creative" | "analyst" | "buyer" | "chat";
  version: number;
  successPct: number;
  body: string;
}

const PROMPTS: PromptEntry[] = [
  {
    id: "p_strat",
    key: "agent.strategist.system",
    label: "Strategist — system",
    scope: "strategist",
    version: 7,
    successPct: 91,
    body:
      "You are the Strategist, the Manager of Managers. Decompose the client's business goal into delegable tasks for the Creative, Analyst, and Buyer agents. Always optimise for margin and respect the tenant's autonomy level.",
  },
  {
    id: "p_crea",
    key: "agent.creative.system",
    label: "Creative — system",
    scope: "creative",
    version: 12,
    successPct: 88,
    body:
      "You are the Creative agent. Generate on-brand, platform-native content variations. Never invent claims; ground copy in the provided brand brief and product facts.",
  },
  {
    id: "p_chat",
    key: "assistant.chat.system",
    label: "Client Chat Assistant — system",
    scope: "chat",
    version: 4,
    successPct: 94,
    body:
      "You are the client's business co-pilot. Be concise and proactive. Surface high-stakes actions for approval rather than executing silently when autonomy is APPROVAL_REQUIRED.",
  },
];

/** Editable view of the prompts driving each agent + the chat assistant. */
export function PromptRegistryEditor() {
  const [selectedId, setSelectedId] = useState(PROMPTS[0].id);
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(PROMPTS.map((p) => [p.id, p.body]))
  );

  const selected = PROMPTS.find((p) => p.id === selectedId)!;
  const dirty = drafts[selectedId] !== selected.body;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Prompt list */}
      <Card className="lg:col-span-1">
        <div className="divide-y divide-border-subtle">
          {PROMPTS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors",
                p.id === selectedId ? "bg-surface-overlay" : "hover:bg-surface-overlay/60"
              )}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-content-primary">{p.label}</div>
                <div className="truncate font-mono text-[11px] text-content-muted">{p.key}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs text-content-secondary">v{p.version}</div>
                <div
                  className={cn(
                    "text-[11px]",
                    p.successPct >= 90 ? "text-status-active" : "text-status-pending"
                  )}
                >
                  {p.successPct}%
                </div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Editor */}
      <Card className="flex flex-col lg:col-span-2">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-content-primary">{selected.label}</div>
            <div className="font-mono text-[11px] text-content-muted">
              {selected.key} · v{selected.version} · {selected.successPct}% success
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty}
              onClick={() => setDrafts((d) => ({ ...d, [selectedId]: selected.body }))}
            >
              Revert
            </Button>
            <Button variant="primary" size="sm" disabled={!dirty}>
              {dirty ? `Save v${selected.version + 1}` : "Saved"}
            </Button>
          </div>
        </div>
        <textarea
          value={drafts[selectedId]}
          onChange={(e) => setDrafts((d) => ({ ...d, [selectedId]: e.target.value }))}
          spellCheck={false}
          className="min-h-[280px] flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-relaxed text-content-primary outline-none"
        />
        <div className="border-t border-border-subtle px-4 py-2 text-[11px] text-content-muted">
          Saving creates a new version. The meta-agent A/B-tests new versions before promotion.
        </div>
      </Card>
    </div>
  );
}
