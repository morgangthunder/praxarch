"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, GripVertical, Megaphone, X } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { useWorkspace } from "@/components/workspace-context";
import { cn, formatCurrency } from "@/lib/utils";
import { CRM_PIPELINE_STAGES } from "@/lib/mock-data";
import type {
  AgentStatus,
  CrmContact,
  CrmOpportunity,
  CrmOpportunityStage,
  CrmPipelineStage,
} from "@/lib/types";

const SOURCE_LABEL: Record<CrmContact["source"], string> = {
  "ad:meta": "Meta ad",
  "ad:google": "Google ad",
  "ad:tiktok": "TikTok ad",
  "ad:linkedin": "LinkedIn ad",
  "ad:email": "Email",
  manual: "Manual",
  import: "Import",
};

const STAGE_STATUS: Record<CrmOpportunityStage, AgentStatus> = {
  new: "info",
  qualified: "pending",
  proposal: "info",
  won: "active",
  lost: "error",
};

type Tab = "pipeline" | "contacts";

export function CrmHub({
  slug,
  initialContacts,
  initialOpportunities,
  stages = CRM_PIPELINE_STAGES,
}: {
  slug: string;
  initialContacts: CrmContact[];
  initialOpportunities: CrmOpportunity[];
  stages?: CrmPipelineStage[];
}) {
  const { can } = useWorkspace();
  const canEdit = can("edit_crm");

  const [tab, setTab] = useState<Tab>("pipeline");
  const [contacts] = useState(initialContacts);
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<CrmContact | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const contactById = useMemo(
    () => Object.fromEntries(contacts.map((c) => [c.id, c])),
    [contacts]
  );

  const allTags = useMemo(() => [...new Set(contacts.flatMap((c) => c.tags))].sort(), [contacts]);

  const filteredContacts = tagFilter
    ? contacts.filter((c) => c.tags.includes(tagFilter))
    : contacts;

  const openPipelineEur =
    opportunities
      .filter((o) => o.stage !== "won" && o.stage !== "lost")
      .reduce((s, o) => s + o.dealValueCents, 0) / 100;

  const wonThisMonth = opportunities.filter((o) => o.stage === "won").length;

  function moveOpportunity(id: string, stage: CrmOpportunityStage) {
    if (!canEdit) return;
    setOpportunities((prev) =>
      prev.map((o) =>
        o.id === id ? { ...o, stage, stageChangedAt: new Date().toISOString() } : o
      )
    );
    // Production: PATCH /crm/opportunities/:id/stage → n8n webhook `crm.opportunity.stage_changed`
  }

  return (
    <div className="space-y-5">
      {/* Bridge to Customer Acquisition — the dovetail point from the master plan */}
      <Card className="border-border-subtle bg-surface-base">
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-status-pending" />
            <div>
              <p className="text-sm font-medium text-content-primary">Fed by Customer Acquisition</p>
              <p className="mt-0.5 text-xs text-content-muted">
                Ad clicks and form fills become contacts with first-touch attribution. Deals marked Won close
                the loop — conversion uploads to Meta/Google and Stripe revenue attribution (planned CA §9.1).
              </p>
            </div>
          </div>
          <Link
            href={`/app/${slug}/acquisition`}
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-content-secondary transition-colors hover:text-content-primary"
          >
            View campaigns &amp; funnel
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <StatChip label="Open pipeline" value={formatCurrency(openPipelineEur)} />
        <StatChip label="Contacts" value={String(contacts.length)} />
        <StatChip label="Won (all time)" value={String(wonThisMonth)} accent="text-status-active" />
      </div>

      <div className="inline-flex rounded-lg border border-border-subtle bg-surface-base p-0.5">
        {(["pipeline", "contacts"] as Tab[]).map((t) => (
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

      {tab === "pipeline" && (
        <PipelineBoard
          stages={stages}
          opportunities={opportunities}
          contactById={contactById}
          canEdit={canEdit}
          draggingId={draggingId}
          onDragStart={setDraggingId}
          onDragEnd={() => setDraggingId(null)}
          onDrop={moveOpportunity}
        />
      )}

      {tab === "contacts" && (
        <ContactsTable
          contacts={filteredContacts}
          opportunities={opportunities}
          allTags={allTags}
          tagFilter={tagFilter}
          onTagFilter={setTagFilter}
          onSelect={setSelectedContact}
          canEdit={canEdit}
        />
      )}

      {selectedContact && (
        <ContactDrawer
          contact={selectedContact}
          opportunities={opportunities.filter((o) => o.contactId === selectedContact.id)}
          onClose={() => setSelectedContact(null)}
        />
      )}
    </div>
  );
}

function PipelineBoard({
  stages,
  opportunities,
  contactById,
  canEdit,
  draggingId,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  stages: CrmPipelineStage[];
  opportunities: CrmOpportunity[];
  contactById: Record<string, CrmContact>;
  canEdit: boolean;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (id: string, stage: CrmOpportunityStage) => void;
}) {
  const visibleStages = stages.filter((s) => s.id !== "lost");

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {visibleStages.map((stage) => {
        const cards = opportunities.filter((o) => o.stage === stage.id);
        const columnTotal = cards.reduce((s, o) => s + o.dealValueCents, 0) / 100;
        return (
          <div
            key={stage.id}
            className="flex w-64 shrink-0 flex-col rounded-xl border border-border-subtle bg-surface-raised"
            onDragOver={(e) => canEdit && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (draggingId) onDrop(draggingId, stage.id);
              onDragEnd();
            }}
          >
            <div className="border-b border-border-subtle px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-content-primary">{stage.label}</span>
                <span className="rounded border border-border-subtle bg-surface-base px-1.5 py-0.5 font-mono text-[11px] text-content-muted">
                  {cards.length}
                </span>
              </div>
              <div className="mt-1 font-mono text-xs text-content-muted">{formatCurrency(columnTotal)}</div>
            </div>
            <div className="flex min-h-[200px] flex-1 flex-col gap-2 p-2">
              {cards.map((opp) => {
                const contact = contactById[opp.contactId];
                return (
                  <div
                    key={opp.id}
                    draggable={canEdit}
                    onDragStart={() => onDragStart(opp.id)}
                    onDragEnd={onDragEnd}
                    className={cn(
                      "rounded-lg border border-border-subtle bg-surface-base p-2.5 text-sm transition-shadow",
                      canEdit && "cursor-grab active:cursor-grabbing hover:border-border-strong",
                      draggingId === opp.id && "opacity-50"
                    )}
                  >
                    <div className="flex items-start gap-1.5">
                      {canEdit && <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-muted" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-content-primary">{opp.title}</p>
                        <p className="truncate text-xs text-content-muted">{contact?.name ?? "Unknown"}</p>
                        <p className="mt-1.5 font-mono text-xs text-content-secondary">
                          {formatCurrency(opp.dealValueCents / 100)}
                        </p>
                        {opp.expectedCloseDate && (
                          <p className="mt-1 text-[11px] text-content-muted">
                            Close {opp.expectedCloseDate.slice(0, 10)}
                          </p>
                        )}
                        {contact?.source.startsWith("ad:") && (
                          <span className="mt-1.5 inline-block text-[10px] uppercase tracking-wide text-content-muted">
                            {SOURCE_LABEL[contact.source]}
                          </span>
                        )}
                      </div>
                    </div>
                    {!canEdit && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {stages
                          .filter((s) => s.id !== opp.stage)
                          .slice(0, 3)
                          .map((s) => (
                            <span key={s.id} className="text-[10px] text-content-muted">
                              {s.label}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {cards.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-content-muted">No deals</p>
              )}
            </div>
          </div>
        );
      })}

      {/* Lost column — collapsed list */}
      <div className="flex w-48 shrink-0 flex-col rounded-xl border border-dashed border-border-subtle bg-surface-base/50">
        <div className="border-b border-border-subtle px-3 py-2.5">
          <span className="text-sm font-medium text-content-muted">Lost</span>
        </div>
        <div className="space-y-1 p-2">
          {opportunities
            .filter((o) => o.stage === "lost")
            .map((o) => (
              <p key={o.id} className="truncate px-1 text-xs text-content-muted">
                {o.title}
              </p>
            ))}
        </div>
      </div>
    </div>
  );
}

function ContactsTable({
  contacts,
  opportunities,
  allTags,
  tagFilter,
  onTagFilter,
  onSelect,
  canEdit,
}: {
  contacts: CrmContact[];
  opportunities: CrmOpportunity[];
  allTags: string[];
  tagFilter: string | null;
  onTagFilter: (tag: string | null) => void;
  onSelect: (c: CrmContact) => void;
  canEdit: boolean;
}) {
  const openDeals = (contactId: string) =>
    opportunities.filter((o) => o.contactId === contactId && o.stage !== "won" && o.stage !== "lost").length;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Contacts</CardTitle>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => onTagFilter(null)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs transition-colors",
                !tagFilter ? "border-border-strong bg-surface-overlay text-content-primary" : "border-border-subtle text-content-muted"
              )}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => onTagFilter(tag === tagFilter ? null : tag)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-xs transition-colors",
                  tagFilter === tag
                    ? "border-border-strong bg-surface-overlay text-content-primary"
                    : "border-border-subtle text-content-muted hover:text-content-secondary"
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-[11px] uppercase tracking-wide text-content-muted">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Tags</th>
              <th className="px-4 py-2 text-right font-medium">Open deals</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {contacts.map((c) => (
              <tr
                key={c.id}
                onClick={() => onSelect(c)}
                className="cursor-pointer transition-colors hover:bg-surface-overlay"
              >
                <td className="px-4 py-2.5 font-medium text-content-primary">{c.name}</td>
                <td className="px-4 py-2.5 text-content-secondary">{c.email}</td>
                <td className="px-4 py-2.5 text-content-muted">{c.company ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-content-muted">{SOURCE_LABEL[c.source]}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {c.tags.slice(0, 3).map((t) => (
                      <span key={t} className="rounded border border-border-subtle bg-surface-base px-1.5 py-0.5 text-[10px] text-content-muted">
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-content-secondary">{openDeals(c.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!canEdit && (
        <p className="border-t border-border-subtle px-4 py-2.5 text-xs text-content-muted">
          View-only — you can&apos;t edit contacts or move deals.
        </p>
      )}
    </Card>
  );
}

function ContactDrawer({
  contact,
  opportunities,
  onClose,
}: {
  contact: CrmContact;
  opportunities: CrmOpportunity[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-border-strong bg-surface-raised shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-content-primary">{contact.name}</h2>
            <p className="text-xs text-content-muted">{contact.email}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-content-muted hover:bg-surface-overlay">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
          <Section title="Source">
            <p className="text-content-secondary">{SOURCE_LABEL[contact.source]}</p>
            {contact.leadId && (
              <p className="mt-1 text-xs text-content-muted">
                Synced from Acquisition lead <span className="font-mono">{contact.leadId}</span>
              </p>
            )}
          </Section>

          {contact.attribution && (
            <Section title="Attribution (first touch)">
              <dl className="space-y-1 text-xs">
                {contact.attribution.utmCampaign && (
                  <Row label="Campaign" value={contact.attribution.utmCampaign} />
                )}
                {contact.attribution.utmSource && <Row label="UTM source" value={contact.attribution.utmSource} />}
                {contact.attribution.gclid && <Row label="gclid" value={`${contact.attribution.gclid.slice(0, 12)}…`} />}
                {contact.attribution.fbclid && <Row label="fbclid" value={`${contact.attribution.fbclid.slice(0, 12)}…`} />}
              </dl>
              <p className="mt-2 text-[11px] text-content-muted">
                Passed to Stripe metadata on checkout; renewals fire server-side conversions (CA plan).
              </p>
            </Section>
          )}

          {Object.keys(contact.customFields).length > 0 && (
            <Section title="Custom fields">
              <dl className="space-y-1 text-xs">
                {Object.entries(contact.customFields).map(([k, v]) => (
                  <Row key={k} label={k} value={v} />
                ))}
              </dl>
            </Section>
          )}

          <Section title="Opportunities">
            {opportunities.length === 0 ? (
              <p className="text-xs text-content-muted">No deals yet.</p>
            ) : (
              <ul className="space-y-2">
                {opportunities.map((o) => (
                  <li key={o.id} className="flex items-center gap-2 rounded-lg border border-border-subtle px-2.5 py-2">
                    <StatusDot status={STAGE_STATUS[o.stage]} />
                    <span className="flex-1 text-content-secondary">{o.title}</span>
                    <span className="font-mono text-xs">{formatCurrency(o.dealValueCents / 100)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-content-muted">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-content-muted">{label}</dt>
      <dd className="font-mono text-content-secondary">{value}</dd>
    </div>
  );
}

function StatChip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card className="min-w-[120px]">
      <CardBody className="py-2.5">
        <div className="text-[11px] uppercase tracking-wide text-content-muted">{label}</div>
        <div className={cn("mt-0.5 font-mono text-base font-semibold", accent ?? "text-content-primary")}>{value}</div>
      </CardBody>
    </Card>
  );
}
