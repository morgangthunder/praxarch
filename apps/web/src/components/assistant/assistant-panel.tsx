"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { useAssistant } from "./assistant-context";
import { AssistantMarkdown } from "./assistant-markdown";

/** Top-bar button that opens the assistant. Cmd/Ctrl+J also toggles it. */
export function AssistantLauncher() {
  const { open, setOpen } = useAssistant();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, setOpen]);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-subtle bg-surface-base px-3 text-sm text-content-secondary transition-colors hover:border-border-strong hover:text-content-primary"
    >
      <Sparkles className="h-4 w-4 text-status-pending" />
      <span className="hidden sm:inline">Assistant</span>
      <Kbd>⌘J</Kbd>
    </button>
  );
}

/** Right-hand slide-over chat panel wired to the agentic assistant. */
export function AssistantPanel() {
  const { open, setOpen, messages, streaming, send } = useAssistant();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (!open) return null;

  const submit = () => {
    const text = input.trim();
    if (!text || streaming) return;
    void send(text);
    setInput("");
  };

  return (
    <div className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-md flex-col border-l border-border-strong bg-surface-raised shadow-2xl">
      <header className="flex h-14 items-center justify-between border-b border-border-subtle px-4">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-status-pending" />
          <span className="text-sm font-semibold">Assistant</span>
          <span className="text-xs text-content-muted">runs your platform actions</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-surface-overlay hover:text-content-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="rounded-lg border border-border-subtle bg-surface-base p-3 text-sm text-content-secondary">
            Ask me to configure or run things — e.g. <em>&ldquo;list my services&rdquo;</em>,{" "}
            <em>&ldquo;deploy web-app to staging&rdquo;</em>, or{" "}
            <em>&ldquo;promote web-app to prod&rdquo;</em>. High-stakes actions route to WhatsApp for approval.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="space-y-1.5">
            <div
              className={cn(
                "max-w-[90%] rounded-lg border px-3 py-2 text-sm",
                m.role === "user"
                  ? "ml-auto border-border-strong bg-surface-overlay text-content-primary"
                  : "border-border-subtle bg-surface-base text-content-secondary"
              )}
            >
              {m.role === "assistant" ? (
                m.content ? (
                  <AssistantMarkdown content={m.content} />
                ) : streaming ? (
                  <span className="text-content-muted">…</span>
                ) : null
              ) : (
                m.content
              )}
            </div>
            {m.tools?.map((t, i) => (
              <div
                key={i}
                className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-base px-2 py-1 text-[11px] text-content-muted"
              >
                <span className="font-mono text-content-secondary">{t.capabilityId}</span>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-border-subtle p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={streaming ? "Working…" : "Ask the assistant…"}
          disabled={streaming}
          className="h-9 flex-1 rounded-lg border border-border-subtle bg-surface-base px-3 text-sm text-content-primary outline-none placeholder:text-content-muted focus:border-border-strong disabled:opacity-60"
        />
        <button
          onClick={submit}
          disabled={streaming}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-content-primary px-3 text-sm font-medium text-surface-base transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "ok"
      ? "text-status-active"
      : status === "awaiting_approval"
        ? "text-status-pending"
        : status === "error"
          ? "text-status-error"
          : "text-content-muted";
  const label = status === "awaiting_approval" ? "sent for approval" : status;
  return <span className={cn("font-medium", tone)}>{label}</span>;
}
