import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import type { AgentStatus } from "@/lib/types";

interface Flow {
  id: string;
  name: string;
  category: "acquisition" | "finances" | "automations" | "ingestion";
  status: AgentStatus;
  approval: "approved" | "pending" | "rejected";
  lastRun: string;
  nodes: number;
}

const FLOWS: Flow[] = [
  { id: "wf_lead_enrich", name: "Lead → CRM enrichment", category: "automations", status: "active", approval: "approved", lastRun: "2m ago", nodes: 9 },
  { id: "wf_content_pipe", name: "Content generation pipeline", category: "acquisition", status: "active", approval: "approved", lastRun: "just now", nodes: 14 },
  { id: "wf_bank_ingest", name: "Bank statement ingestion", category: "finances", status: "idle", approval: "pending", lastRun: "—", nodes: 7 },
  { id: "wf_video_check", name: "Video suitability filter", category: "ingestion", status: "info", approval: "approved", lastRun: "18m ago", nodes: 11 },
  { id: "wf_churn_ping", name: "Churn-risk WhatsApp ping", category: "automations", status: "pending", approval: "pending", lastRun: "—", nodes: 6 },
];

const APPROVAL_STYLE: Record<Flow["approval"], string> = {
  approved: "text-status-active",
  pending: "text-status-pending",
  rejected: "text-status-error",
};

/**
 * Super-Admin → Flow Studio.
 * Register, approve, and monitor the n8n workflows that drive agentic
 * execution. The app owner authors flows in n8n; this is the governance layer.
 */
export default function FlowStudioPage() {
  const n8nUrl = process.env.NEXT_PUBLIC_N8N_URL ?? "http://localhost:5690";
  return (
    <>
      <PageHeader
        title="Flow Studio"
        subtitle="Govern the n8n workflows behind every agent and automation."
        actions={
          <div className="flex gap-2">
            <a href={n8nUrl} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm">Open n8n ↗</Button>
            </a>
            <Button variant="primary" size="sm">Register flow</Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Workflows</CardTitle>
          <span className="text-xs text-content-muted">{FLOWS.length} registered</span>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border-subtle text-left text-[11px] uppercase tracking-wide text-content-muted">
                <th className="px-4 py-2 font-medium">Workflow</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Nodes</th>
                <th className="px-4 py-2 font-medium">Approval</th>
                <th className="px-4 py-2 font-medium">Last run</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {FLOWS.map((f) => (
                <tr key={f.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-overlay">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <StatusDot status={f.status} />
                      <span className="font-medium text-content-primary">{f.name}</span>
                    </div>
                    <span className="ml-[18px] font-mono text-[11px] text-content-muted">{f.id}</span>
                  </td>
                  <td className="px-4 py-2.5 text-content-secondary">{f.category}</td>
                  <td className="px-4 py-2.5 font-mono text-content-secondary">{f.nodes}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium ${APPROVAL_STYLE[f.approval]}`}>
                      {f.approval}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-content-muted">{f.lastRun}</td>
                  <td className="px-4 py-2.5 text-right">
                    {f.approval === "pending" ? (
                      <Button variant="primary" size="sm">Approve</Button>
                    ) : (
                      <Button variant="ghost" size="sm">Edit</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-4 text-xs text-content-muted">
        Flows are authored in n8n and registered here for approval. Only approved flows are
        callable by agents. Each carries an input/output contract and a tenant scope.
      </p>
    </>
  );
}
