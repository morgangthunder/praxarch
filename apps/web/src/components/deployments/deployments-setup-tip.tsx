"use client";

import { useEffect, useState } from "react";
import { Lightbulb, X, ChevronDown, ChevronUp } from "lucide-react";

/**
 * Onboarding tip for the Deployments page — how to structure a new repo so moving
 * its deploys onto Praxarch/Coolify is smooth. Dismissible per tenant.
 */
export function DeploymentsSetupTip({ tenantSlug }: { tenantSlug: string }) {
  const storageKey = `praxarch:deploy-tip-dismissed:${tenantSlug}`;
  const [dismissed, setDismissed] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setDismissed(typeof window !== "undefined" && localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
  }

  if (dismissed) return null;

  return (
    <div className="rounded-lg border border-status-info/30 bg-status-info/5 px-3 py-2.5 text-xs">
      <div className="flex items-start gap-2.5">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-status-info" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-content-primary">
              Setting up a new app? Make it deploy-ready for Praxarch
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="rounded p-0.5 text-content-muted hover:text-content-primary"
                aria-label={expanded ? "Collapse tip" : "Expand tip"}
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="rounded p-0.5 text-content-muted hover:text-content-primary"
                aria-label="Dismiss tip"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p className="mt-1 text-content-secondary">
            A few habits make handing a repo to Praxarch a one-click affair — and avoid port/proxy clashes when we
            take over an existing server.
          </p>
          {expanded && (
            <ul className="mt-2 space-y-1.5 text-content-secondary">
              <TipItem>
                Put a <span className="font-mono">Dockerfile</span> or{" "}
                <span className="font-mono">docker-compose.yml</span> at the repo root (Coolify looks for the{" "}
                <span className="font-mono">.yml</span> extension).
              </TipItem>
              <TipItem>
                Externalise databases &amp; caches — point Mongo/Postgres/Redis at managed URLs via env vars instead
                of bundling them in the app&apos;s compose. Stateless apps move cleanly and can&apos;t clash on DB ports.
              </TipItem>
              <TipItem>
                Don&apos;t hard-code host <span className="font-mono">ports:</span> or{" "}
                <span className="font-mono">container_name:</span> — let Coolify manage networking. Fixed host ports
                are the #1 cause of takeover conflicts.
              </TipItem>
              <TipItem>
                Keep all config in environment variables (12-factor) and commit a{" "}
                <span className="font-mono">.env.example</span>. Paste real values into the wizard&apos;s Secrets step —
                never commit them.
              </TipItem>
              <TipItem>
                Use a dedicated <span className="font-mono">staging</span> branch and{" "}
                <span className="font-mono">main</span>/<span className="font-mono">master</span> for production so each
                environment tracks its own branch.
              </TipItem>
              <TipItem>
                Expose a health-check route (e.g. <span className="font-mono">/health</span> → 200) so Coolify knows when
                a deploy is actually up.
              </TipItem>
              <TipItem>
                Already running nginx/Caddy on the box? Keep it as the front door — the wizard&apos;s{" "}
                <span className="text-content-primary">Reconcile</span> step sets Coolify&apos;s proxy to{" "}
                <span className="font-mono">none</span> and preserves your TLS.
              </TipItem>
            </ul>
          )}
          {!expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-1 text-status-info hover:underline"
            >
              Show the checklist
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TipItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-status-info" />
      <span>{children}</span>
    </li>
  );
}
