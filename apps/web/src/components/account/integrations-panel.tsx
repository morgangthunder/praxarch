"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { MOCK_INTEGRATIONS } from "@/lib/mock-data";

const CATEGORY_LABEL: Record<string, string> = {
  messaging: "Messaging",
  ads: "Advertising",
  accounting: "Accounting",
  deploy: "Deployment",
};

/** Connect/disconnect tenant integrations (WhatsApp, ad platforms, accounting). */
export function IntegrationsPanel() {
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(MOCK_INTEGRATIONS.map((i) => [i.id, i.connected]))
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
      </CardHeader>
      <div className="divide-y divide-border-subtle">
        {MOCK_INTEGRATIONS.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-content-primary">{i.name}</div>
              <div className="text-[11px] uppercase tracking-wide text-content-muted">
                {CATEGORY_LABEL[i.category]}
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs text-content-muted">
                {state[i.id] ? "Connected" : "Off"}
              </span>
              <Toggle
                checked={state[i.id]}
                onChange={(next) => setState((s) => ({ ...s, [i.id]: next }))}
                aria-label={`${i.name} connection`}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
