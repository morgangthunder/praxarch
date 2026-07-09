"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rememberActiveTenant } from "@/lib/tenant-navigation";
import { cn } from "@/lib/utils";

interface OpenTenantWorkspaceProps {
  slug: string;
  name: string;
  /** Path under /app/[tenant] — defaults to overview. */
  path?: string;
  variant?: "primary" | "ghost" | "link";
  size?: "sm" | "md";
  className?: string;
  children?: React.ReactNode;
}

/** Navigate into a tenant workspace and remember it for admin return navigation. */
export function OpenTenantWorkspace({
  slug,
  name,
  path = "overview",
  variant = "primary",
  size = "sm",
  className,
  children,
}: OpenTenantWorkspaceProps) {
  const href = `/app/${slug}/${path}`;

  if (variant === "link") {
    return (
      <Link
        href={href}
        onClick={() => rememberActiveTenant(slug, name)}
        className={cn(
          "inline-flex items-center gap-1 text-xs text-status-info hover:underline",
          className
        )}
      >
        {children ?? `Open ${name}`}
        <ArrowRight className="h-3 w-3" />
      </Link>
    );
  }

  return (
    <Link href={href} onClick={() => rememberActiveTenant(slug, name)} className={className}>
      <Button variant={variant === "ghost" ? "ghost" : "primary"} size={size}>
        {children ?? "Open workspace"}
      </Button>
    </Link>
  );
}
