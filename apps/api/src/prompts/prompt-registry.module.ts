import { Module } from "@nestjs/common";
import { AssistantCaseController } from "./assistant-case.controller";
import { AssistantCaseService } from "./assistant-case.service";
import { PromptRegistryController } from "./prompt-registry.controller";
import { PromptRegistryService } from "./prompt-registry.service";

/** Platform-wide assistant prompts + per-case AI model config. DatabaseModule is global. */
@Module({
  controllers: [PromptRegistryController, AssistantCaseController],
  providers: [PromptRegistryService, AssistantCaseService],
  exports: [PromptRegistryService, AssistantCaseService],
})
export class PromptRegistryModule {}
