import { Module } from "@nestjs/common";
import { CapabilityModule } from "../capabilities/capability.module";
import { PromptRegistryModule } from "../prompts/prompt-registry.module";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";

/** The in-app agentic assistant. Drives the shared Capability registry. */
@Module({
  imports: [CapabilityModule, PromptRegistryModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
