import { redirect } from "next/navigation";

/**
 * App entry. The default experience is the tenant workspace (not super-admin).
 *
 * In production this resolves the signed-in user's active tenant. For the demo
 * it lands on the max-access tenant; super-admins reach the platform console via
 * the "Super Admin" item inside the tenant nav.
 */
export default function RootPage() {
  redirect("/app/acme/overview");
}
