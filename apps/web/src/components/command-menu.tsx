"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { MOCK_TENANTS } from "@/lib/mock-data";

/**
 * Global Cmd+K command bar.
 * Jumps between client dashboards, triggers CI/CD, and searches the prompt registry.
 *
 * In production each `onSelect` calls the typed BFF SDK; here actions are stubbed.
 */
export function CommandMenu() {
  const [open, setOpen] = useState(false);

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

  // Stubbed action handler — wire to BFF (e.g. POST /cicd/deploy) in production.
  const run = (label: string) => {
    setOpen(false);
    if (typeof window !== "undefined") console.info(`[command] ${label}`);
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
                placeholder="Type a command or search…"
                className="h-12 w-full bg-transparent text-sm text-content-primary outline-none placeholder:text-content-muted"
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-content-muted">
                No results found.
              </Command.Empty>

              <Group heading="Clients">
                {MOCK_TENANTS.map((t) => (
                  <Item key={t.id} onSelect={() => run(`jump:${t.slug}`)}>
                    <span className="text-content-secondary">Open</span> {t.name}
                  </Item>
                ))}
              </Group>

              <Group heading="Deploy">
                <Item onSelect={() => run("deploy:staging")}>Deploy → staging</Item>
                <Item onSelect={() => run("deploy:production")}>
                  Deploy → production
                  <span className="ml-auto text-status-pending">requires approval</span>
                </Item>
              </Group>

              <Group heading="Prompt Registry">
                <Item onSelect={() => run("prompts:search")}>Search prompts…</Item>
                <Item onSelect={() => run("prompts:diff")}>View latest prompt diffs</Item>
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

function Item({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-content-primary",
        "data-[selected=true]:bg-surface-base"
      )}
    >
      {children}
    </Command.Item>
  );
}
