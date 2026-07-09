"use client";

import Link from "next/link";
import { StatusDot } from "@/components/ui/status-dot";
import { rememberActiveTenant } from "@/lib/tenant-navigation";
import type { Tenant } from "@/lib/types";

/** Tenant name link from admin tables — remembers workspace for return navigation. */
export function TenantTableLink({ tenant }: { tenant: Tenant }) {
  return (
    <Link
      href={`/app/${tenant.slug}/overview`}
      onClick={() => rememberActiveTenant(tenant.slug, tenant.name)}
      className="flex items-center gap-2.5"
    >
      <StatusDot status={tenant.status} />
      <span className="font-medium text-content-primary">{tenant.name}</span>
    </Link>
  );
}
