import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { CheckpointRepository } from "./checkpoint.repository";
import { N8nClientService } from "./n8n-client.service";
import { parseReply } from "./reply-parser";
import { Checkpoint, DeployActionPayload } from "./checkpoint.types";
import { CicdService } from "../cicd/cicd.service";
import { MarketingService } from "../marketing/marketing.service";
import type { ContentPublishPayload } from "../marketing/contracts";

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
    private readonly cicd: CicdService,
    private readonly marketing: MarketingService,
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
    return this.persistAndNotify({
      tenantId: input.tenantId,
      executionId: input.executionId,
      resumeToken: input.resumeToken,
      kind: input.kind,
      action: { type: "n8n" },
      summary: input.summary,
      approverWaId: input.approverWaId,
    });
  }

  /**
   * Park a production-promote request for WhatsApp approval. Created by a Member
   * who can deploy but not promote prod; on *YES* we run the deploy directly.
   */
  async openDeployCheckpoint(input: {
    tenantId: string;
    deploy: DeployActionPayload;
    summary: string;
    approverWaId: string;
  }): Promise<Checkpoint> {
    return this.persistAndNotify({
      tenantId: input.tenantId,
      kind: "deploy_promote",
      action: { type: "deploy", deploy: input.deploy },
      summary: input.summary,
      approverWaId: input.approverWaId,
    });
  }

  /**
   * Park a content-publish request for WhatsApp approval. Created when a tenant is
   * under APPROVAL_REQUIRED autonomy (or a Viewer/Member requests publish); on
   * *YES* we publish via the Marketing OS adapter.
   */
  async openContentCheckpoint(input: {
    tenantId: string;
    content: ContentPublishPayload;
    summary: string;
    approverWaId: string;
  }): Promise<Checkpoint> {
    return this.persistAndNotify({
      tenantId: input.tenantId,
      kind: "content_publish",
      action: { type: "publish", publish: input.content },
      summary: input.summary,
      approverWaId: input.approverWaId,
    });
  }

  /** Shared: persist a checkpoint and ping the approver over WhatsApp. */
  private async persistAndNotify(input: {
    tenantId: string;
    executionId?: string;
    resumeToken?: string;
    kind: Checkpoint["kind"];
    action: Checkpoint["action"];
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
      action: input.action,
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

    this.logger.log(
      `Checkpoint ${checkpoint.id} (${input.kind}) opened for tenant ${input.tenantId}`
    );
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

    // Deploy checkpoints can't be "edited" — only approved or cancelled.
    if (checkpoint.action.type === "deploy") {
      if (decision.action === "approve") {
        await this.cicd.executeApprovedDeploy(
          checkpoint.action.deploy,
          checkpoint.tenantId,
          fromWaId
        );
        await this.checkpoints.updateStatus(checkpoint.id, "approved");
        await this.sendWhatsapp(fromWaId, "✅ Approved — promoting to production now.");
      } else {
        await this.checkpoints.updateStatus(checkpoint.id, "rejected");
        await this.sendWhatsapp(fromWaId, "🛑 Cancelled — production was not changed.");
      }
      return { resolved: true };
    }

    // Content-publish checkpoints: approve → publish via the Marketing OS.
    if (checkpoint.action.type === "publish") {
      if (decision.action === "approve") {
        await this.marketing.publishApprovedContent(checkpoint.action.publish, checkpoint.tenantId);
        await this.checkpoints.updateStatus(checkpoint.id, "approved");
        await this.sendWhatsapp(fromWaId, "✅ Approved — publishing now.");
      } else {
        await this.checkpoints.updateStatus(checkpoint.id, "rejected");
        await this.sendWhatsapp(fromWaId, "🛑 Cancelled — nothing was published.");
      }
      return { resolved: true };
    }

    // n8n-backed checkpoints: resume the parked execution with the decision.
    await this.n8n.resume({
      executionId: checkpoint.executionId ?? "",
      resumeToken: checkpoint.resumeToken ?? "",
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
      // Non-fatal in local/dev: log the message instead of failing the request,
      // so the checkpoint still persists and the flow is exercisable.
      this.logger.warn(`Twilio not configured — would send to ${to}: ${body.replace(/\n/g, " ")}`);
      return;
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
