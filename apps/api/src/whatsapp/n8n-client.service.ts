import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CheckpointDecision } from "./checkpoint.types";

/**
 * Thin client that resumes (or aborts) a parked n8n workflow execution.
 *
 * n8n workflows pause at a Wait node exposing a resume webhook. We POST the
 * human decision back to that node; n8n continues the Brain's reasoning or
 * unwinds the campaign. The resume call is HMAC-protected so only this service
 * (not a leaked URL) can drive it.
 */
@Injectable()
export class N8nClientService {
  private readonly logger = new Logger(N8nClientService.name);

  constructor(private readonly config: ConfigService) {}

  async resume(params: {
    executionId: string;
    resumeToken: string;
    decision: CheckpointDecision;
    tenantId: string;
  }): Promise<void> {
    const base = this.config.get<string>("N8N_BASE_URL");
    if (!base) throw new HttpException("n8n not configured", HttpStatus.INTERNAL_SERVER_ERROR);

    const url = `${base}/webhook-waiting/${params.executionId}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // n8n validates this against the token it embedded in the Wait node.
          "X-Resume-Token": params.resumeToken,
          "X-Tenant-Id": params.tenantId,
        },
        body: JSON.stringify({ decision: params.decision }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        this.logger.error(`n8n resume failed (${res.status}): ${detail}`);
        throw new HttpException("Failed to resume workflow", HttpStatus.BAD_GATEWAY);
      }
      this.logger.log(`Resumed execution ${params.executionId} → ${params.decision.action}`);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`n8n resume error: ${(err as Error).message}`);
      throw new HttpException("Unable to reach orchestration engine", HttpStatus.BAD_GATEWAY);
    }
  }
}
