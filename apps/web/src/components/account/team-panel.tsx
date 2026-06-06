"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import type { TeamMember } from "@/lib/types";

type Role = TeamMember["role"];
const ROLES: Role[] = ["owner", "member", "viewer"];

/**
 * Workspace team management (Owner-only). Invite users and assign roles that map
 * to the same Owner/Member/Viewer capability model used across the app.
 * Mock state for now; persists via the BFF in production.
 */
export function TeamPanel({ initial }: { initial: TeamMember[] }) {
  const [members, setMembers] = useState<TeamMember[]>(initial);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");

  function invite() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setMembers((prev) => [
      ...prev,
      { id: `u_${Date.now()}`, name: "—", email: trimmed, role: inviteRole, status: "invited" },
    ]);
    setEmail("");
  }

  function setRole(id: string, role: Role) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <span className="text-xs text-content-muted">{members.length} members</span>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="flex gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="invite by email…"
            className="h-9 flex-1 rounded-lg border border-border-subtle bg-surface-base px-2.5 text-sm text-content-primary outline-none focus:border-border-strong"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            className="h-9 rounded-lg border border-border-subtle bg-surface-base px-2 text-sm text-content-primary outline-none focus:border-border-strong"
          >
            {ROLES.map((r) => (
              <option key={r} value={r} className="capitalize">{r}</option>
            ))}
          </select>
          <Button variant="primary" size="sm" onClick={invite}>Invite</Button>
        </div>

        <div className="divide-y divide-border-subtle">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-2.5">
              <div className="h-7 w-7 shrink-0 rounded-full border border-border-subtle bg-surface-overlay" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm text-content-primary">
                  <span className="truncate">{m.name !== "—" ? m.name : m.email}</span>
                  {m.status === "invited" && (
                    <span className="rounded border border-status-pending/40 bg-status-pending/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-status-pending">
                      invited
                    </span>
                  )}
                </div>
                {m.name !== "—" && <div className="truncate text-xs text-content-muted">{m.email}</div>}
              </div>
              <select
                value={m.role}
                onChange={(e) => setRole(m.id, e.target.value as Role)}
                className="h-8 rounded-lg border border-border-subtle bg-surface-base px-2 text-xs capitalize text-content-secondary outline-none focus:border-border-strong"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} className="capitalize">{r}</option>
                ))}
              </select>
              <StatusDot status={m.status === "active" ? "active" : "pending"} />
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
