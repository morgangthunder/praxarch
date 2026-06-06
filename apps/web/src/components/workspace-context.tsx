"use client";

import { createContext, useContext } from "react";
import { can as roleCan, isSuperAdmin, type Capability, type ViewIdentity } from "@/lib/roles";

interface WorkspaceContextValue {
  /** The current "View as" identity (demo stand-in for real auth). */
  view: ViewIdentity;
  setView: (v: ViewIdentity) => void;
  tenantSlug: string;
  tenantName: string;
  /** Action-capability check for the current identity. */
  can: (capability: Capability) => boolean;
  isSuperAdmin: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  value,
  children,
}: {
  value: { view: ViewIdentity; setView: (v: ViewIdentity) => void; tenantSlug: string; tenantName: string };
  children: React.ReactNode;
}) {
  const ctx: WorkspaceContextValue = {
    ...value,
    can: (capability) => roleCan(value.view, capability),
    isSuperAdmin: isSuperAdmin(value.view),
  };
  return <WorkspaceContext.Provider value={ctx}>{children}</WorkspaceContext.Provider>;
}

/** Read the current workspace identity + capabilities from any client component. */
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}
