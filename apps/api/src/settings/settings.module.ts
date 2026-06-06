import { Module } from "@nestjs/common";
import { WorkspaceSettingsService } from "./workspace-settings.service";

/** Shared per-tenant settings (approver, autonomy). DatabaseModule is global. */
@Module({
  providers: [WorkspaceSettingsService],
  exports: [WorkspaceSettingsService],
})
export class SettingsModule {}
