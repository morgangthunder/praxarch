"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Msg {
  id: string;
  role: "user" | "strategist";
  text: string;
}

const SEED: Msg[] = [
  { id: "m1", role: "strategist", text: "I've shifted 30% of budget toward video creatives — CPA dropped 18% last week. Want me to scale the winning ad set?" },
];

/**
 * Chat panel for refining business strategy with the Strategist (MoM root agent).
 * Production wires this to a streaming BFF endpoint; here it's a local stub.
 */
export function StrategyChat({ tenantName }: { tenantName: string }) {
  const [messages, setMessages] = useState<Msg[]>(SEED);
  const [input, setInput] = useState("");

  function send() {
    const text = input.trim();
    if (!text) return;
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", text },
      {
        id: crypto.randomUUID(),
        role: "strategist",
        text: `Understood. I'll factor that into ${tenantName}'s plan and route any high-stakes changes for approval.`,
      },
    ]);
    setInput("");
  }

  return (
    <Card className="flex h-[420px] flex-col">
      <CardHeader>
        <CardTitle>Strategy Chat</CardTitle>
        <span className="text-xs text-content-muted">Strategist agent</span>
      </CardHeader>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[85%] rounded-lg border px-3 py-2 text-sm",
              m.role === "user"
                ? "ml-auto border-border-strong bg-surface-overlay text-content-primary"
                : "border-border-subtle bg-surface-base text-content-secondary"
            )}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-border-subtle p-2.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Refine strategy…"
          className="h-9 flex-1 rounded-lg border border-border-subtle bg-surface-base px-3 text-sm text-content-primary outline-none placeholder:text-content-muted focus:border-border-strong"
        />
        <Button variant="primary" size="md" onClick={send}>
          Send
        </Button>
      </div>
    </Card>
  );
}
