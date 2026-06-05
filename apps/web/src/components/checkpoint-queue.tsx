import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import type { HitlCheckpoint } from "@/lib/types";

const KIND_LABEL: Record<HitlCheckpoint["kind"], string> = {
  content_publish: "Content",
  budget_change: "Budget",
  alert: "Alert",
};

/**
 * HITL checkpoint queue. Mirrors approvals sent over WhatsApp (Phase 3) so the
 * operator can also resolve them in-app. Each item maps to a parked n8n execution.
 */
export function CheckpointQueue({ checkpoints }: { checkpoints: HitlCheckpoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Approval Queue</CardTitle>
        <StatusDot status="pending" withLabel label={`${checkpoints.length} waiting`} />
      </CardHeader>
      <div className="divide-y divide-border-subtle">
        {checkpoints.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-content-muted">Nothing awaiting approval.</p>
        )}
        {checkpoints.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded border border-border-subtle bg-surface-base px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-content-muted">
                  {KIND_LABEL[c.kind]}
                </span>
                <span className="truncate text-xs text-content-muted">{c.tenantName}</span>
              </div>
              <p className="mt-1 truncate text-sm text-content-primary">{c.summary}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button variant="ghost" size="sm">Edit</Button>
              <Button variant="primary" size="sm">Approve</Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
