import { PageSkeleton } from "@/components/ui/page-skeleton";

/** Shown immediately on intra-tenant navigation while the page segment loads. */
export default function TenantModuleLoading() {
  return <PageSkeleton />;
}
