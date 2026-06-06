"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TOPUP_PACKS } from "@/lib/modules";
import { formatCompact, formatCurrency } from "@/lib/utils";

/**
 * Tenant credit view: the tier's included monthly allowance, consumption, and
 * à la carte top-up packs. (Distinct from the super-admin margin view.)
 */
export function AllowancePanel({
  includedAllowance,
  used,
  topUpRemaining,
  period,
  readOnly = false,
}: {
  includedAllowance: number;
  used: number;
  topUpRemaining: number;
  period: string;
  readOnly?: boolean;
}) {
  const [extra, setExtra] = useState(0);

  const totalAvailable = includedAllowance + topUpRemaining + extra;
  const remaining = Math.max(totalAvailable - used, 0);
  const usedPct = Math.min(Math.round((used / totalAvailable) * 100), 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit allowance</CardTitle>
        <span className="text-xs text-content-muted">{period}</span>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Included" value={`${formatCompact(includedAllowance)}`} />
          <Metric label="Used" value={`${formatCompact(used)}`} />
          <Metric
            label="Remaining"
            value={`${formatCompact(remaining)}`}
            accent={remaining < includedAllowance * 0.2 ? "text-status-pending" : "text-status-active"}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-content-muted">
            <span>{usedPct}% used</span>
            <span>{formatCompact(totalAvailable)} total this window</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-overlay">
            <div
              className={usedPct > 80 ? "h-full rounded-full bg-status-pending" : "h-full rounded-full bg-content-secondary"}
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>

        {!readOnly && (
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-content-muted">
            Top up
          </div>
          <div className="grid grid-cols-3 gap-2">
            {TOPUP_PACKS.map((p) => (
              <button
                key={p.id}
                onClick={() => setExtra((e) => e + p.credits)}
                className="rounded-lg border border-border-subtle bg-surface-base px-2 py-2 text-center transition-colors hover:border-border-strong"
              >
                <div className="font-mono text-sm font-semibold text-content-primary">
                  {formatCompact(p.credits)}
                </div>
                <div className="text-[11px] text-content-muted">{formatCurrency(p.priceEur)}</div>
              </button>
            ))}
          </div>
          {extra > 0 && (
            <div className="mt-2 flex items-center justify-between rounded-lg border border-status-active/30 bg-status-active/5 px-3 py-2 text-xs">
              <span className="text-content-secondary">+{formatCompact(extra)} credits staged</span>
              <Button variant="primary" size="sm" onClick={() => setExtra(0)}>Checkout</Button>
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
