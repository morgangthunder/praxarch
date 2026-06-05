import { notFound } from "next/navigation";
import { TenantShell } from "@/components/tenant-shell";
import { getTenant } from "@/lib/mock-data";

/** Tenant workspace shell. Resolves the tenant from the URL slug. */
export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = getTenant(slug);
  if (!tenant) notFound();

  return <TenantShell tenant={tenant}>{children}</TenantShell>;
}
