"use client";

import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
}

/** Minimal monochrome switch; green when on (status accent). */
export function Toggle({ checked, onChange, disabled, ...rest }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
        disabled && "cursor-not-allowed opacity-40",
        checked ? "bg-status-active/80" : "bg-surface-overlay border border-border-strong"
      )}
      {...rest}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-1"
        )}
      />
    </button>
  );
}
