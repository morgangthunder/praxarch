import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { CheckpointRepository } from "./checkpoint.repository";
import { N8nClientService } from "./n8n-client.service";
import { parseReply } from "./reply-parser";
import { Checkpoint } from "./checkpoint.types";

const CHECKPOINT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * WhatsApp HITL engine.
 *
 * - `openCheckpoint`: parks an agent decision, messages the approver.
 * - `handleInboundReply`: matches a reply to its checkpoint and resumes/aborts n8n.
 *
 * This is the bridge between the Brain (n8n) and the human, carried by Twilio.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly checkpoints: CheckpointRepository,
    private readonly n8n: N8nClientService,
    private readonly config: ConfigService
  ) {}

  /** Called by the Marketing OS / n8n when an action needs human sign-off. */
  async openCheckpoint(input: {
    tenantId: string;
    executionId: string;
    resumeToken: string;
    kind: Checkpoint["kind"];
    summary: string;
    approverWaId: string;
  }): Promise<Checkpoint> {
    const now = Date.now();
    const checkpoint: Checkpoint = {
      id: randomUUID(),
      tenantId: input.tenantId,
      executionId: input.executionId,
      resumeToken: input.resumeToken,
      kind: input.kind,
      summary: input.summary,
      approverWaId: input.approverWaId,
      status: "awaiting",
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + CHECKPOINT_TTL_MS).toISOString(),
    };
    await this.checkpoints.create(checkpoint);

    await this.sendWhatsapp(
      input.approverWaId,
      `🔔 *Approval needed*\n\n${input.summary}\n\nReply *YES* to proceed, *NO* to cancel, or send edits.`
    );

    this.logger.log(`Checkpoint ${checkpoint.id} opened for tenant ${input.tenantId}`);
    return checkpoint;
  }

  /**
   * Resolve an inbound reply.
   * The only correlation key Twilio gives us is the sender's number, so we look
   * up that approver's most recent awaiting checkpoint.
   */
  async handleInboundReply(fromWaId: string, body: string): Promise<{ resolved: boolean }> {
    const checkpoint = await this.checkpoints.findLatestAwaitingByApprover(fromWaId);
    if (!checkpoint) {
      await this.sendWhatsapp(fromWaId, "No pending approval found for your number.");
      return { resolved: false };
    }

    if (new Date(checkpoint.expiresAt).getTime() < Date.now()) {
      await this.checkpoints.updateStatus(checkpoint.id, "expired");
      await this.sendWhatsapp(fromWaId, "That request has expired and was not actioned.");
      return { resolved: false };
    }

    const decision = parseReply(body);

    await this.n8n.resume({
      executionId: checkpoint.executionId,
      resumeToken: checkpoint.resumeToken,
      decision,
      tenantId: checkpoint.tenantId,
    });

    const nextStatus = decision.action === "reject" ? "rejected" : "approved";
    await this.checkpoints.updateStatus(checkpoint.id, nextStatus);

    const ack =
      decision.action === "approve"
        ? "✅ Approved — executing now."
        : decision.action === "reject"
          ? "🛑 Cancelled — nothing was published."
          : "✏️ Got it — the agent will revise and re-check with you.";
    await this.sendWhatsapp(fromWaId, ack);

    return { resolved: true };
  }

  /** Sends a WhatsApp message via the Twilio REST API. */
  private async sendWhatsapp(to: string, body: string): Promise<void> {
    const sid = this.config.get<string>("TWILIO_ACCOUNT_SID");
    const token = this.config.get<string>("TWILIO_AUTH_TOKEN");
    const from = this.config.get<string>("TWILIO_WHATSAPP_FROM");
    if (!sid || !token || !from) {
      throw new HttpException("Twilio not configured", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const form = new URLSearchParams({ To: to, From: from, Body: body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      this.logger.error(`Twilio send failed (${res.status}): ${detail}`);
      // Non-fatal for inbound acks; rethrow so callers can decide.
      throw new HttpException("Failed to send WhatsApp message", HttpStatus.BAD_GATEWAY);
    }
  }
}
