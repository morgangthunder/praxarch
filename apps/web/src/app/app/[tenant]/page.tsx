import { notFound, redirect } from "next/navigation";
import { getTenant } from "@/lib/mock-data";
import { entitledModules } from "@/lib/modules";

/** Tenant index → first entitled module (every tenant has at least Account). */
export default async function TenantIndexPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = getTenant(slug);
  if (!tenant) notFound();

  const first = entitledModules(tenant.entitlements)[0];
  redirect(`/app/${slug}/${first.path}`);
}
