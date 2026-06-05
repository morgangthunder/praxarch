"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AutonomyLevel } from "@/lib/types";

const LEVELS: { value: AutonomyLevel; label: string; hint: string; dot: string }[] = [
  { value: "FULLY_AUTONOMOUS", label: "Autonomous", hint: "Agents act, notify after", dot: "bg-status-active" },
  { value: "APPROVAL_REQUIRED", label: "Approval", hint: "Pause for WhatsApp sign-off", dot: "bg-status-pending" },
  { value: "PAUSED", label: "Paused", hint: "Draft only, execute nothing", dot: "bg-status-idle" },
];

interface AutonomyToggleProps {
  value?: AutonomyLevel;
  onChange?: (level: AutonomyLevel) => void;
}

/**
 * Segmented control gating the HITL engine. The selected level is read by both
 * NestJS (before any Plumbing call) and n8n (at checkpoint nodes).
 */
export function AutonomyToggle({ value = "FULLY_AUTONOMOUS", onChange }: AutonomyToggleProps) {
  const [level, setLevel] = useState<AutonomyLevel>(value);
  const select = (l: AutonomyLevel) => {
    setLevel(l);
    onChange?.(l);
  };

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-lg border border-border-subtle bg-surface-base p-0.5">
        {LEVELS.map((l) => {
          const selected = l.value === level;
          return (
            <button
              key={l.value}
              type="button"
              onClick={() => select(l.value)}
              aria-pressed={selected}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[0.45rem] px-2.5 py-1.5 text-xs font-medium transition-colors",
                selected
                  ? "bg-surface-overlay text-content-primary"
                  : "text-content-muted hover:text-content-secondary"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", l.dot)} />
              {l.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-content-muted">
        {LEVELS.find((l) => l.value === level)?.hint}
      </p>
    </div>
  );
}
