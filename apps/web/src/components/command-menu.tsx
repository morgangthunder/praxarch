"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Sparkles } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { MOCK_TENANTS } from "@/lib/mock-data";
import { useAssistant } from "@/components/assistant/assistant-context";

/**
 * Global Cmd+K command bar.
 * Jumps between client dashboards, triggers CI/CD, and searches the prompt registry.
 *
 * In production each `onSelect` calls the typed BFF SDK; here actions are stubbed.
 */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const { ask } = useAssistant();

  // Hand the typed query off to the agentic assistant.
  const handOff = () => {
    setOpen(false);
    ask(search.trim() || "What can you do?");
    setSearch("");
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Navigate to a route, or fall back to logging stubbed actions.
  const run = (target: string) => {
    setOpen(false);
    if (target.startsWith("/")) router.push(target);
    else if (typeof window !== "undefined") console.info(`[command] ${target}`);
  };

  return (
    <>
      {/* Trigger affordance in the top bar */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-subtle bg-surface-base px-3 text-sm text-content-muted transition-colors hover:border-border-strong hover:text-content-secondary"
      >
        <span>Search or jump to…</span>
        <Kbd>⌘K</Kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <Command
            label="Global command menu"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-xl border border-border-strong bg-surface-overlay shadow-2xl"
          >
            <div className="border-b border-border-subtle px-3">
              <Command.Input
                autoFocus
                value={search}
                onValueChange={setSearch}
                placeholder="Type a command, search, or ask the assistant…"
                className="h-12 w-full bg-transparent text-sm text-content-primary outline-none placeholder:text-content-muted"
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-content-muted">
                No commands match — press Enter to ask the assistant.
              </Command.Empty>

              <Group heading="Assistant">
                <Item onSelect={handOff} value={`ask-assistant ${search}`} forceMount>
                  <Sparkles className="h-3.5 w-3.5 text-status-pending" />
                  <span>{search.trim() ? `Ask: ${search.trim()}` : "Ask the assistant…"}</span>
                </Item>
              </Group>

              <Group heading="Workspaces">
                {MOCK_TENANTS.map((t) => (
                  <Item key={t.id} onSelect={() => run(`/app/${t.slug}/overview`)}>
                    <span className="text-content-secondary">Open</span> {t.name}
                  </Item>
                ))}
              </Group>

              <Group heading="Modules">
                <Item onSelect={() => run("/app/acme/crm")}>CRM — pipeline &amp; contacts</Item>
                <Item onSelect={() => run("/app/acme/acquisition")}>Customer Acquisition</Item>
                <Item onSelect={() => run("/app/acme/deployments")}>Deployments</Item>
              </Group>

              <Group heading="Super Admin">
                <Item onSelect={() => run("/admin")}>Control Center</Item>
                <Item onSelect={() => run("/admin/tenants")}>Manage tenants &amp; access</Item>
                <Item onSelect={() => run("/admin/flows")}>Open Flow Studio</Item>
                <Item onSelect={() => run("/admin/prompts")}>Edit prompt registry</Item>
              </Group>
            </Command.List>
          </Command>
        </div>
      )}
    </>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="px-1 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-content-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1"
    >
      {children}
    </Command.Group>
  );
}

function Item({
  children,
  onSelect,
  value,
  forceMount,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  value?: string;
  forceMount?: true;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      value={value}
      forceMount={forceMount}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-content-primary",
        "data-[selected=true]:bg-surface-base"
      )}
    >
      {children}
    </Command.Item>
  );
}
