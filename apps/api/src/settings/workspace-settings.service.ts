import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DatabaseService } from "../common/database/database.service";
import { AutonomyLevel, WorkspaceSettings } from "./settings.types";

interface SettingsRow {
  tenant_id: string;
  approver_wa_id: string | null;
  default_autonomy: AutonomyLevel;
}

/**
 * Per-tenant workspace settings. Currently the authoritative source for the
 * HITL approver (replacing the bare env var). Falls back to env defaults so the
 * flow still works before a tenant has configured anything.
 */
@Injectable()
export class WorkspaceSettingsService {
  private readonly logger = new Logger(WorkspaceSettingsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService
  ) {}

  async get(tenantId: string): Promise<WorkspaceSettings> {
    const fallback: WorkspaceSettings = {
      tenantId,
      approverWaId: this.config.get<string>("DEPLOY_APPROVER_WAID") ?? null,
      defaultAutonomy: "APPROVAL_REQUIRED",
    };
    if (!this.db.enabled) return fallback;

    const rows = await this.db.query<SettingsRow>(
      `SELECT tenant_id, approver_wa_id, default_autonomy
         FROM public.workspace_settings WHERE tenant_id = $1`,
      [tenantId]
    );
    if (!rows[0]) return fallback;
    return {
      tenantId: rows[0].tenant_id,
      approverWaId: rows[0].approver_wa_id ?? fallback.approverWaId,
      defaultAutonomy: rows[0].default_autonomy ?? fallback.defaultAutonomy,
    };
  }

  /**
   * Resolve the approver for a given checkpoint kind. Today a single approver
   * serves all kinds; the signature leaves room to specialise (e.g. a separate
   * content approver) without touching callers.
   */
  async resolveApprover(tenantId: string, _kind: "deploy" | "content" | "n8n"): Promise<string> {
    const settings = await this.get(tenantId);
    const approver =
      settings.approverWaId ??
      this.config.get<string>("CONTENT_APPROVER_WAID") ??
      this.config.get<string>("TWILIO_APPROVER_WAID") ??
      "";
    if (!approver) {
      this.logger.warn(`No approver configured for tenant ${tenantId} — HITL will log only.`);
    }
    return approver;
  }
}
