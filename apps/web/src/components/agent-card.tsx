import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { formatCompact } from "@/lib/utils";
import type { Agent } from "@/lib/types";

const ROLE_GLYPH: Record<Agent["role"], string> = {
  strategist: "◆",
  creative: "✎",
  analyst: "▤",
  buyer: "€",
};

/** Compact module representing a single MoM agent and its live state. */
export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Card className="p-3 transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-subtle bg-surface-base font-mono text-xs text-content-secondary">
            {ROLE_GLYPH[agent.role]}
          </span>
          <div>
            <div className="text-sm font-medium text-content-primary">{agent.name}</div>
            <div className="text-[11px] uppercase tracking-wide text-content-muted">
              {agent.role}
            </div>
          </div>
        </div>
        <StatusDot status={agent.status} />
      </div>
      <p className="mt-3 line-clamp-2 text-xs text-content-secondary">{agent.activity}</p>
      <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-2 text-[11px] text-content-muted">
        <span>credits</span>
        <span className="font-mono text-content-secondary">{formatCompact(agent.creditsUsed)}</span>
      </div>
    </Card>
  );
}
