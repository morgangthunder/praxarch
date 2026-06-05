import { cn } from "@/lib/utils";
import type { AgentStatus } from "@/lib/types";

const STATUS_STYLES: Record<AgentStatus, { dot: string; glow: string; label: string }> = {
  active: { dot: "bg-status-active", glow: "shadow-[0_0_8px_2px_rgb(34_197_94_/_0.5)]", label: "Active" },
  pending: { dot: "bg-status-pending animate-pulse-ring", glow: "", label: "Awaiting approval" },
  error: { dot: "bg-status-error", glow: "shadow-[0_0_8px_2px_rgb(239_68_68_/_0.45)]", label: "Error" },
  info: { dot: "bg-status-info animate-pulse", glow: "", label: "Deploying" },
  idle: { dot: "bg-status-idle", glow: "", label: "Idle" },
};

interface StatusDotProps {
  status: AgentStatus;
  /** Render the textual label alongside the dot. */
  withLabel?: boolean;
  label?: string;
  className?: string;
}

/**
 * The core visual signal of the system. Color here is meaningful:
 *  - glowing green  = autonomous agent running
 *  - pulsing amber  = HITL checkpoint paused, awaiting human
 *  - pulsing blue   = deployment in flight
 */
export function StatusDot({ status, withLabel, label, className }: StatusDotProps) {
  const s = STATUS_STYLES[status];
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot, s.glow)} aria-hidden />
      {withLabel && (
        <span className="text-xs font-medium text-content-secondary">{label ?? s.label}</span>
      )}
    </span>
  );
}
