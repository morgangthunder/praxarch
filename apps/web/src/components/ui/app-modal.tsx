"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useAssistant } from "@/components/assistant/assistant-context";
import { cn } from "@/lib/utils";

const WIDTH = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
} as const;

export function AppModal({
  title,
  onClose,
  children,
  footer,
  maxWidth = "md",
  assistantAware = false,
  closeOnBackdrop = true,
  bodyClassName,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: keyof typeof WIDTH;
  assistantAware?: boolean;
  closeOnBackdrop?: boolean;
  bodyClassName?: string;
}) {
  const { open: assistantOpen } = useAssistant();
  const blockBackdropClose = assistantAware && assistantOpen;

  return (
    <div
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex items-center justify-center p-4 sm:p-6",
        "bg-black/40 backdrop-blur-sm transition-[right]",
        assistantAware && assistantOpen ? "right-[min(28rem,100%)]" : "right-0"
      )}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (!closeOnBackdrop || blockBackdropClose) return;
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
        className={cn(
          "flex w-full flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-overlay shadow-xl",
          "max-h-[min(88vh,100%)]",
          WIDTH[maxWidth],
          assistantAware && assistantOpen && "mr-2"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-3">
          <span id="app-modal-title" className="text-sm font-semibold text-content-primary">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-content-muted hover:text-content-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3", bodyClassName)}>
          {children}
        </div>

        {footer ? <div className="shrink-0 border-t border-border-subtle px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
