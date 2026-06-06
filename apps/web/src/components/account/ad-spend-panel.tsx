"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AD_TOPUP_PACKS } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";
import type { AdBudget, AdChannelSpend } from "@/lib/types";

const CHANNEL_LABEL: Record<AdChannelSpend["channel"], string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  email: "Email",
};

/**
 * The second money meter (separate from action credits): a prepaid ad-budget
 * pool that funds the platforms. Shows pool / spent / remaining, our markup, and
 * a per-channel breakdown. Top-up is hidden in read-only mode (non-owners).
 */
export function AdSpendPanel({
  budget,
  channels,
  readOnly = false,
}: {
  budget: AdBudget;
  channels: AdChannelSpend[];
  readOnly?: boolean;
}) {
  const [staged, setStaged] = useState(0);

  const totalPool = budget.poolEur + staged;
  const remaining = Math.max(totalPool - budget.spentEur, 0);
  const usedPct = totalPool > 0 ? Math.min(Math.round((budget.spentEur / totalPool) * 100), 100) : 0;
  const channelTotal = channels.reduce((s, c) => s + c.spendEur, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ad budget</CardTitle>
        <span className="text-xs text-content-muted">{budget.period}</span>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Pool" value={formatCurrency(totalPool)} />
          <Metric label="Spent" value={formatCurrency(budget.spentEur)} />
          <Metric
            label="Remaining"
            value={formatCurrency(remaining)}
            accent={remaining < budget.poolEur * 0.2 ? "text-status-pending" : "text-status-active"}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-content-muted">
            <span>{usedPct}% of pool spent</span>
            <span>incl. {budget.markupPct}% platform fee</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-overlay">
            <div
              className={usedPct > 80 ? "h-full rounded-full bg-status-pending" : "h-full rounded-full bg-content-secondary"}
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>

        {channels.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-content-muted">
              By channel
            </div>
            {channels.map((c) => {
              const pct = channelTotal > 0 ? Math.round((c.spendEur / channelTotal) * 100) : 0;
              return (
                <div key={c.channel}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-content-secondary">{CHANNEL_LABEL[c.channel]}</span>
                    <span className="font-mono text-content-muted">{formatCurrency(c.spendEur)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-overlay">
                    <div className="h-full rounded-full bg-content-secondary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!readOnly && (
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-content-muted">
              Top up pool
            </div>
            <div className="grid grid-cols-3 gap-2">
              {AD_TOPUP_PACKS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setStaged((s) => s + p.amountEur)}
                  className="rounded-lg border border-border-subtle bg-surface-base px-2 py-2 text-center transition-colors hover:border-border-strong"
                >
                  <div className="font-mono text-sm font-semibold text-content-primary">
                    {formatCurrency(p.amountEur)}
                  </div>
                </button>
              ))}
            </div>
            {staged > 0 && (
              <div className="mt-2 flex items-center justify-between rounded-lg border border-status-active/30 bg-status-active/5 px-3 py-2 text-xs">
                <span className="text-content-secondary">+{formatCurrency(staged)} staged</span>
                <Button variant="primary" size="sm" onClick={() => setStaged(0)}>Checkout</Button>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-content-muted">{label}</div>
      <div className={`mt-0.5 font-mono text-base font-semibold ${accent ?? "text-content-primary"}`}>
        {value}
      </div>
    </div>
  );
}
