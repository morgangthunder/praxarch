import { cn } from "@/lib/utils";

/** Keyboard hint chip used in the command menu and shortcuts. */
export function Kbd({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-subtle",
        "bg-surface-overlay px-1 font-mono text-[10px] font-medium text-content-muted",
        className
      )}
    >
      {children}
    </kbd>
  );
}
