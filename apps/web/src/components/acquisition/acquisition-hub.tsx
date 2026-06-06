"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, MessageCircle, Check, X, Users, ArrowRight } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { StrategyChat } from "@/components/strategy-chat";
import { useWorkspace } from "@/components/workspace-context";
import { cn, formatCurrency } from "@/lib/utils";
import { ASSUMED_AOV_EUR } from "@/lib/mock-data";
import { clientGet, invalidateClientCache } from "@/lib/client-api";
import type { AgentStatus, AutonomyLevel, Campaign, ContentDraft, FunnelStage, Lead } from "@/lib/types";

const CHANNEL_LABEL: Record<Campaign["channel"], string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  email: "Email",
};

const CONTENT_STATUS: Record<ContentDraft["status"], { dot: AgentStatus; label: string }> = {
  draft: { dot: "idle", label: "Draft" },
  awaiting: { dot: "pending", label: "Awaiting approval" },
  scheduled: { dot: "info", label: "Scheduled" },
  published: { dot: "active", label: "Published" },
  rejected: { dot: "error", label: "Rejected" },
};

const AUTONOMY: Record<AutonomyLevel, { dot: AgentStatus; label: string }> = {
  FULLY_AUTONOMOUS: { dot: "active", label: "Fully autonomous" },
  APPROVAL_REQUIRED: { dot: "pending", label: "Approval required" },
  PAUSED: { dot: "idle", label: "Paused" },
};

type Tab = "campaigns" | "content" | "leads";

export function AcquisitionHub({
  slug,
  tenantName,
  autonomy,
  campaigns,
  content,
  funnel,
  leads,
}: {
  slug: string;
  tenantName: string;
  autonomy: AutonomyLevel;
  campaigns: Campaign[];
  content: ContentDraft[];
  funnel: FunnelStage[];
  leads: Lead[];
}) {
  const [tab, setTab] = useState<Tab>("campaigns");

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-4 inline-flex rounded-lg border border-border-subtle bg-surface-raised p-0.5">
          {(["campaigns", "content", "leads"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-[0.4rem] px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                tab === t ? "bg-surface-overlay text-content-primary" : "text-content-muted hover:text-content-secondary"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "campaigns" && <CampaignsTab campaigns={campaigns} />}
        {tab === "content" && <ContentTab slug={slug} autonomy={autonomy} initial={content} />}
        {tab === "leads" && <LeadsTab slug={slug} funnel={funnel} leads={leads} />}
      </div>

      <div>
        <StrategyChat tenantName={tenantName} />
      </div>
    </div>
  );
}

// ── Campaigns ──────────────────────────────────────────────────────────

function CampaignsTab({ campaigns }: { campaigns: Campaign[] }) {
  const spend = campaigns.reduce((s, c) => s + c.spendEur, 0);
  const conversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const blendedCpa = conversions ? spend / conversions : 0;
  const revenue = conversions * ASSUMED_AOV_EUR;
  const roas = spend ? revenue / spend : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ad spend (mo)" value={formatCurrency(spend)} />
        <Stat label="Conversions" value={String(conversions)} />
        <Stat label="Blended CPA" value={formatCurrency(blendedCpa)} />
        <Stat label="ROAS (est)" value={`${roas.toFixed(1)}×`} accent={roas >= 3 ? "text-status-active" : undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campaigns</CardTitle>
          <span className="text-xs text-content-muted">{campaigns.length} total</span>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border-subtle text-left text-[11px] uppercase tracking-wide text-content-muted">
                <th className="px-4 py-2 font-medium">Campaign</th>
                <th className="px-4 py-2 font-medium">Channel</th>
                <th className="px-4 py-2 text-right font-medium">Spend</th>
                <th className="px-4 py-2 text-right font-medium">CPA</th>
                <th className="px-4 py-2 text-right font-medium">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-overlay">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <StatusDot status={c.status} />
                      <span className="font-medium text-content-primary">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-content-secondary">{CHANNEL_LABEL[c.channel]}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-content-secondary">{formatCurrency(c.spendEur)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-content-secondary">{c.cpaEur ? formatCurrency(c.cpaEur) : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-content-secondary">{c.conversions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Content studio ─────────────────────────────────────────────────────

function ContentTab({
  slug,
  autonomy,
  initial,
}: {
  slug: string;
  autonomy: AutonomyLevel;
  initial: ContentDraft[];
}) {
  const { can } = useWorkspace();
  const canEdit = can("edit_content");
  const [items, setItems] = useState<ContentDraft[]>(initial);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    let cancelled = false;
    clientGet<ContentDraft[]>("/api/bff/marketing/content", slug)
      .then((data) => {
        if (!cancelled && data?.length) setItems(data);
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  function update(id: string, status: ContentDraft["status"]) {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    // Persist (optimistic — UI already reflects the change).
    fetch(`/api/bff/marketing/content/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-praxarch-tenant": slug },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  }

  async function generate() {
    const draft = {
      channel: "meta" as const,
      title: "New AI draft — ad copy",
      body: "Draft generated by the Creative agent. Review and approve to publish.",
    };
    try {
      const res = await fetch("/api/bff/marketing/content", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-praxarch-tenant": slug },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(String(res.status));
      const created = (await res.json()) as ContentDraft;
      setItems((prev) => [created, ...prev]);
      invalidateClientCache(slug, "/api/bff/marketing/content");
    } catch {
      setItems((prev) => [
        { id: `${slug}_ct_${Date.now()}`, ...draft, status: "draft", createdAt: new Date().toISOString() },
        ...prev,
      ]);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-raised px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <StatusDot status={AUTONOMY[autonomy].dot} />
          <span className="text-content-secondary">Autonomy:</span>
          <span className="font-medium text-content-primary">{AUTONOMY[autonomy].label}</span>
          <Link href={`/app/${slug}/automations`} className="ml-1 text-xs text-status-info hover:underline">
            change →
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {hydrating && <span className="text-xs text-content-muted">Syncing…</span>}
          {canEdit && (
            <Button variant="primary" size="sm" onClick={generate}>
              <Sparkles className="h-3.5 w-3.5" />
              Generate
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {items.map((c) => (
          <ContentCard key={c.id} slug={slug} item={c} canEdit={canEdit} onUpdate={update} />
        ))}
      </div>
    </div>
  );
}

/** Content channels map onto the Marketing OS social platforms for publishing. */
const CHANNEL_TO_PLATFORMS: Record<ContentDraft["channel"], string[]> = {
  meta: ["facebook", "instagram"],
  google: ["youtube"],
  tiktok: ["tiktok"],
  linkedin: ["linkedin"],
  email: ["facebook"],
};

function ContentCard({
  slug,
  item,
  canEdit,
  onUpdate,
}: {
  slug: string;
  item: ContentDraft;
  canEdit: boolean;
  onUpdate: (id: string, status: ContentDraft["status"]) => void;
}) {
  const [req, setReq] = useState<{ kind: "idle" | "busy" | "requested" | "error"; msg?: string }>({
    kind: "idle",
  });
  const meta = CONTENT_STATUS[item.status];
  const actionable = item.status === "draft" || item.status === "awaiting";

  async function requestApproval() {
    setReq({ kind: "busy" });
    try {
      const res = await fetch("/api/bff/marketing/publish-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: slug,
          platforms: CHANNEL_TO_PLATFORMS[item.channel],
          caption: item.body,
          summary: `Publish "${item.title}" to ${item.channel}`,
        }),
      });
      if (!res.ok) throw new Error(`Request rejected (${res.status})`);
      await res.json().catch(() => ({}));
      setReq({ kind: "requested" });
      onUpdate(item.id, "awaiting");
    } catch (e) {
      setReq({ kind: "error", msg: e instanceof Error ? e.message : "Request failed" });
    }
  }

  return (
    <Card>
      <CardBody className="space-y-2.5">
        <div className="flex items-center gap-2.5">
          <span className="rounded border border-border-subtle bg-surface-base px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-content-muted">
            {CHANNEL_LABEL[item.channel]}
          </span>
          <span className="font-medium text-content-primary">{item.title}</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-content-muted">
            <StatusDot status={meta.dot} />
            {meta.label}
          </span>
        </div>
        <p className="text-sm text-content-secondary">{item.body}</p>

        {canEdit && actionable && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-2.5">
            <Button variant="primary" size="sm" onClick={() => onUpdate(item.id, "published")}>
              <Check className="h-3.5 w-3.5" />
              {item.status === "draft" ? "Approve & publish" : "Approve"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={requestApproval}
              disabled={req.kind === "busy" || req.kind === "requested"}
            >
              <MessageCircle className="mr-1 h-3.5 w-3.5" />
              {req.kind === "busy"
                ? "Requesting…"
                : req.kind === "requested"
                  ? "Requested via WhatsApp"
                  : "Request via WhatsApp"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onUpdate(item.id, "rejected")}>
              <X className="h-3.5 w-3.5" />
              Reject
            </Button>
            {req.kind === "error" && (
              <span className="text-xs text-status-error">{req.msg}</span>
            )}
          </div>
        )}
        {!canEdit && actionable && (
          <p className="border-t border-border-subtle pt-2.5 text-xs text-content-muted">
            View-only — you can't approve or publish content.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

// ── Leads / funnel ─────────────────────────────────────────────────────

const LEAD_STATUS: Record<Lead["status"], AgentStatus> = {
  new: "info",
  qualified: "pending",
  won: "active",
  lost: "error",
};

function LeadsTab({ slug, funnel, leads }: { slug: string; funnel: FunnelStage[]; leads: Lead[] }) {
  const top = Math.max(...funnel.map((s) => s.count), 1);
  const synced = leads.filter((l) => l.contactId).length;
  return (
    <div className="space-y-5">
      <Card className="border-border-subtle bg-surface-base">
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-status-active" />
            <div>
              <p className="text-sm font-medium text-content-primary">
                {synced} lead{synced === 1 ? "" : "s"} synced to CRM
              </p>
              <p className="mt-0.5 text-xs text-content-muted">
                Acquisition owns top-of-funnel volume and attribution. CRM owns contacts, pipeline stages, and
                closed-loop revenue when deals are marked Won.
              </p>
            </div>
          </div>
          <Link
            href={`/app/${slug}/crm`}
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-content-secondary transition-colors hover:text-content-primary"
          >
            Open pipeline
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Marketing funnel</CardTitle>
          <span className="text-xs text-content-muted">Volume before CRM identification</span>
        </CardHeader>
        <CardBody className="space-y-3">
          {funnel.map((s) => (
            <div key={s.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-content-secondary">{s.label}</span>
                <span className="font-mono text-content-muted">{s.count}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-overlay">
                <div className="h-full rounded-full bg-content-secondary" style={{ width: `${Math.round((s.count / top) * 100)}%` }} />
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent leads</CardTitle>
          <span className="text-xs text-content-muted">Each row links to a CRM contact when identified</span>
        </CardHeader>
        <div className="divide-y divide-border-subtle">
          {leads.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <StatusDot status={LEAD_STATUS[l.status]} />
              <span className="text-content-primary">{l.name}</span>
              <span className="text-[11px] uppercase tracking-wide text-content-muted">{CHANNEL_LABEL[l.source]}</span>
              {l.contactId && (
                <Link
                  href={`/app/${slug}/crm`}
                  className="rounded border border-border-subtle bg-surface-base px-1.5 py-0.5 text-[10px] text-content-muted hover:text-content-secondary"
                >
                  in CRM
                </Link>
              )}
              <span className="ml-auto font-mono text-content-secondary">{formatCurrency(l.valueEur)}</span>
              <span className="w-16 text-right text-xs capitalize text-content-muted">{l.status}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── shared ─────────────────────────────────────────────────────────────

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardBody>
        <div className="text-[11px] uppercase tracking-wide text-content-muted">{label}</div>
        <div className={cn("mt-1 font-mono text-lg font-semibold", accent ?? "text-content-primary")}>{value}</div>
      </CardBody>
    </Card>
  );
}
