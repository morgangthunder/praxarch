import type { TenantContext } from "../common/tenant/tenant-context";

/** A query reads state; a command changes it. */
export type CapabilityKind = "query" | "command";

/**
 * Risk drives the autonomy gate:
 *  - low/medium: execute directly (the wrapped service still enforces RBAC).
 *  - high: execute only if the caller is entitled to auto-run AND did not
 *    explicitly request approval; otherwise route to a WhatsApp HITL checkpoint.
 */
export type CapabilityRisk = "low" | "medium" | "high";

/** Where a dispatch originated — recorded in the audit trail. */
export type CapabilitySource = "ui" | "assistant" | "mcp";

/** Minimal JSON-schema-ish descriptor — used both for LLM tools and validation. */
export interface CapabilityField {
  type: "string" | "number" | "boolean" | "array";
  description?: string;
  /** For type "array": the item type (strings only, for our cases). */
  items?: "string";
  enum?: string[];
}

export interface CapabilitySchema {
  properties: Record<string, CapabilityField>;
  required?: string[];
}

export interface CapabilityContext {
  tenant: TenantContext;
  source: CapabilitySource;
  /** Force the HITL path even when the caller could auto-run (demo + caution). */
  requestApproval?: boolean;
  /** Human/agent identifier for the audit trail. */
  actor?: string;
}

export interface CapabilityResult<T = unknown> {
  status: "ok" | "awaiting_approval" | "error";
  data?: T;
  /** Set when status === "awaiting_approval". */
  checkpointId?: string;
  message?: string;
}

export interface CapabilityDescriptor {
  id: string;
  title: string;
  domain: string;
  kind: CapabilityKind;
  risk: CapabilityRisk;
  /** Natural-language description surfaced to the LLM as the tool description. */
  description: string;
  inputSchema: CapabilitySchema;
  /** Rough action-credit cost, metered into the audit ledger. */
  credits: number;
  handler: (input: Record<string, unknown>, ctx: CapabilityContext) => Promise<CapabilityResult>;
}

/** Public (handler-free) view of a capability, for discovery + tool definitions. */
export type CapabilitySummary = Omit<CapabilityDescriptor, "handler">;

export function toSummary(d: CapabilityDescriptor): CapabilitySummary {
  const { handler: _handler, ...rest } = d;
  return rest;
}
