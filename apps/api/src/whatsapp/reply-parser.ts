import { CheckpointDecision } from "./checkpoint.types";

const APPROVE = new Set(["yes", "y", "approve", "approved", "ok", "go", "ship", "👍", "✅"]);
const REJECT = new Set(["no", "n", "reject", "rejected", "stop", "cancel", "abort", "👎"]);

/**
 * Interprets a free-text WhatsApp reply into a structured decision.
 * Anything that isn't a clear yes/no is treated as edit instructions, which
 * the agent re-incorporates before re-prompting for approval.
 */
export function parseReply(rawBody: string): CheckpointDecision {
  const text = rawBody.trim();
  const normalized = text.toLowerCase().replace(/[.!]+$/, "");

  if (APPROVE.has(normalized)) return { action: "approve" };
  if (REJECT.has(normalized)) return { action: "reject" };

  return { action: "edit", instructions: text };
}
