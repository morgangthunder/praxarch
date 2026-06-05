import { notFound, redirect } from "next/navigation";
import { getTenant } from "@/lib/mock-data";

/** Tenant index → Overview (the workspace home, always entitled). */
export default async function TenantIndexPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  if (!getTenant(slug)) notFound();
  redirect(`/app/${slug}/overview`);
}
