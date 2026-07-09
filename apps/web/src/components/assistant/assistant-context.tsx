"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export interface ToolEvent {
  capabilityId: string;
  status: string;
  message?: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: ToolEvent[];
}

interface AssistantContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  messages: AssistantMessage[];
  streaming: boolean;
  /**
   * Open the panel and send a message. `text` is what the user sees in chat;
   * `extraContext` is sent to the API only (system context block) — never rendered.
   */
  ask: (text: string, extraContext?: Record<string, string>) => void;
  /** Send within the current open session. */
  send: (text: string, extraContext?: Record<string, string>) => void;
}

const Ctx = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({
  tenantSlug,
  role,
  children,
}: {
  tenantSlug: string;
  /** Current "View as" identity, forwarded so the assistant knows the caller's role. */
  role?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const streamingRef = useRef(false);

  const currentModule = pathname?.split("/")[3]; // /app/[tenant]/<module>

  const send = useCallback(
    async (text: string, extraContext?: Record<string, string>) => {
      const trimmed = text.trim();
      if (!trimmed || streamingRef.current) return;
      streamingRef.current = true;
      setStreaming(true);

      const userMsg: AssistantMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
      const assistantId = crypto.randomUUID();
      setMessages((m) => [...m, userMsg, { id: assistantId, role: "assistant", content: "", tools: [] }]);

      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

      try {
        const res = await fetch("/api/bff/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-praxarch-tenant": tenantSlug },
          body: JSON.stringify({
            messages: history,
            context: { role, module: currentModule, route: pathname, ...extraContext },
          }),
        });
        if (!res.body) throw new Error("No stream");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith("data:")) continue;
            const event = JSON.parse(line.slice(5).trim());
            applyEvent(setMessages, assistantId, event);
          }
        }
      } catch {
        applyEvent(setMessages, assistantId, { type: "error", message: "Connection failed." });
      } finally {
        streamingRef.current = false;
        setStreaming(false);
      }
    },
    [messages, tenantSlug, role, currentModule, pathname]
  );

  const ask = useCallback(
    (text: string, extraContext?: Record<string, string>) => {
      setOpen(true);
      void send(text, extraContext);
    },
    [send]
  );

  return (
    <Ctx.Provider value={{ open, setOpen, messages, streaming, ask, send }}>{children}</Ctx.Provider>
  );
}

type StreamEvent =
  | { type: "tool_start"; capabilityId: string; input: Record<string, unknown> }
  | { type: "tool_result"; capabilityId: string; status: string; message?: string }
  | { type: "text"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };

function applyEvent(
  setMessages: React.Dispatch<React.SetStateAction<AssistantMessage[]>>,
  assistantId: string,
  event: StreamEvent
) {
  setMessages((msgs) =>
    msgs.map((m) => {
      if (m.id !== assistantId) return m;
      if (event.type === "text") return { ...m, content: m.content + event.delta };
      if (event.type === "tool_result") {
        return {
          ...m,
          tools: [...(m.tools ?? []), { capabilityId: event.capabilityId, status: event.status, message: event.message }],
        };
      }
      if (event.type === "error") {
        return { ...m, content: m.content || `⚠️ ${event.message}` };
      }
      return m;
    })
  );
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAssistant must be used within an AssistantProvider");
  return ctx;
}
