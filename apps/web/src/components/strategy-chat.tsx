"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAssistant } from "@/components/assistant/assistant-context";

const SUGGESTIONS = [
  "List my services",
  "Promote web-app to prod",
  "Draft a launch post for LinkedIn",
];

/**
 * Strategy entry point for the Acquisition view. Hands off to the shared agentic
 * assistant (Capability-layer tool-calling) rather than running its own stub —
 * one assistant, one capability registry, everywhere.
 */
export function StrategyChat({ tenantName }: { tenantName: string }) {
  const { ask } = useAssistant();
  const [input, setInput] = useState("");

  const send = () => {
    const text = input.trim();
    if (!text) return;
    ask(text);
    setInput("");
  };

  return (
    <Card className="flex h-[420px] flex-col">
      <CardHeader>
        <CardTitle>Strategy Assistant</CardTitle>
        <span className="text-xs text-content-muted">
          Runs {tenantName}&apos;s platform actions — opens in the Assistant panel
        </span>
      </CardHeader>
      <div className="flex flex-1 flex-col justify-center gap-3 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-content-secondary">
          <Sparkles className="h-4 w-4 text-status-pending" />
          Ask the assistant to plan or execute — it routes high-stakes actions for approval.
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="rounded-lg border border-border-subtle bg-surface-base px-2.5 py-1.5 text-xs text-content-secondary transition-colors hover:border-border-strong hover:text-content-primary"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-border-subtle p-2.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask the strategist…"
          className="h-9 flex-1 rounded-lg border border-border-subtle bg-surface-base px-3 text-sm text-content-primary outline-none placeholder:text-content-muted focus:border-border-strong"
        />
        <Button variant="primary" size="md" onClick={send}>
          Ask
        </Button>
      </div>
    </Card>
  );
}
