import { Body, Controller, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { AssistantService } from "./assistant.service";
import { ChatDto } from "./dto/chat.dto";
import { CurrentTenant, type TenantContext } from "../common/tenant/tenant-context";

@Controller("assistant")
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  /**
   * Streamed assistant chat (Server-Sent Events). Each frame is one
   * `AssistantEvent` (tool_start / tool_result / text / done / error).
   */
  @Post("chat")
  async chat(
    @Body() dto: ChatDto,
    @CurrentTenant() tenant: TenantContext,
    @Res() res: Response
  ): Promise<void> {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const stream = this.assistant.stream(dto.messages, {
      tenant,
      role: dto.context?.role,
      module: dto.context?.module,
      route: dto.context?.route,
      wizardStep: dto.context?.wizardStep,
      wizardHosting: dto.context?.wizardHosting,
      wizardStepIndex: dto.context?.wizardStepIndex,
      wizardRepo: dto.context?.wizardRepo,
      wizardName: dto.context?.wizardName,
    });

    for await (const event of stream) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end();
  }
}
