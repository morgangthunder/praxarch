import { AdminShell } from "@/components/admin-shell";

/** Super-admin surface: Control Center, Tenants, Flow Studio, Prompt Registry. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
