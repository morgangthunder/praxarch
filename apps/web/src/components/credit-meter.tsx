import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact, formatCurrency } from "@/lib/utils";
import type { CreditWindow } from "@/lib/types";

/**
 * Credit & margin view. Surfaces the profitability of automated work:
 * charged − cost = margin. This is the heart of the business model.
 */
export function CreditMeter({ data }: { data: CreditWindow }) {
  const margin = data.charged - data.cost;
  const marginPct = data.charged > 0 ? Math.round((margin / data.charged) * 100) : 0;
  const costRatio = data.charged > 0 ? (data.cost / data.charged) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credits &amp; Margin</CardTitle>
        <span className="text-xs text-content-muted">{data.period}</span>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Charged" value={`${formatCompact(data.charged)} cr`} />
          <Metric label="Provider cost" value={formatCurrency(data.cost / 100)} />
          <Metric
            label="Margin"
            value={`${marginPct}%`}
            accent={marginPct >= 55 ? "text-status-active" : "text-status-pending"}
          />
        </div>

        {/* Cost-vs-charged bar: filled = provider cost, remainder = margin */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-content-muted">
            <span>Cost ratio</span>
            <span>{formatCurrency(margin / 100)} retained</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-overlay">
            <div
              className="h-full rounded-full bg-content-secondary"
              style={{ width: `${Math.min(costRatio, 100)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-base px-3 py-2">
          <span className="text-xs text-content-muted">Prepaid balance</span>
          <span className="font-mono text-sm font-medium text-content-primary">
            {formatCompact(data.balance)} cr
          </span>
        </div>
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
