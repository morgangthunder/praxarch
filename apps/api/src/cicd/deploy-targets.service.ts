import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../common/database/database.service";
import type {
  DeployTargetRecord,
  DeployTargetStatus,
  DeployProfile,
  DeployProfileOptions,
  UpsertDeployTargetInput,
} from "./deploy-targets.types";
import { normalizeDeployProfile } from "./compose-build-profiles";

interface DeployTargetRow {
  id: string;
  tenant_id: string;
  service_id: string;
  environment: "staging" | "production";
  coolify_server_uuid: string | null;
  coolify_project_uuid: string | null;
  coolify_app_uuid: string | null;
  coolify_env_uuid: string | null;
  repo: string;
  branch: string;
  git_provider: string;
  auth_method: string;
  private_key_uuid: string | null;
  build_pack: string;
  ports_exposes: string;
  status: DeployTargetStatus;
  error_message: string | null;
  deploy_profile: string;
  deploy_profile_options: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class DeployTargetsService {
  constructor(private readonly db: DatabaseService) {}

  async get(
    tenantId: string,
    serviceId: string,
    environment: "staging" | "production"
  ): Promise<DeployTargetRecord | null> {
    const rows = await this.db.query<DeployTargetRow>(
      `SELECT * FROM public.deploy_targets
       WHERE tenant_id = $1 AND service_id = $2 AND environment = $3`,
      [tenantId, serviceId, environment]
    );
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  /** Update wizard-editable fields without clearing Coolify linkage. */
  async patchWizardFields(
    tenantId: string,
    serviceId: string,
    environment: "staging" | "production",
    fields: {
      coolifyServerUuid?: string;
      repo?: string;
      branch?: string;
      buildPack?: DeployTargetRecord["buildPack"];
      portsExposes?: string;
      deployProfile?: DeployProfile;
      deployProfileOptions?: DeployProfileOptions;
    }
  ): Promise<DeployTargetRecord | null> {
    const rows = await this.db.query<DeployTargetRow>(
      `UPDATE public.deploy_targets
       SET coolify_server_uuid = COALESCE($4, coolify_server_uuid),
           repo = COALESCE($5, repo),
           branch = COALESCE($6, branch),
           build_pack = COALESCE($7, build_pack),
           ports_exposes = COALESCE($8, ports_exposes),
           deploy_profile = COALESCE($9, deploy_profile),
           deploy_profile_options = COALESCE($10::jsonb, deploy_profile_options),
           updated_at = now()
       WHERE tenant_id = $1 AND service_id = $2 AND environment = $3
       RETURNING *`,
      [
        tenantId,
        serviceId,
        environment,
        fields.coolifyServerUuid ?? null,
        fields.repo ?? null,
        fields.branch ?? null,
        fields.buildPack ?? null,
        fields.portsExposes ?? null,
        fields.deployProfile ?? null,
        fields.deployProfileOptions ? JSON.stringify(fields.deployProfileOptions) : null,
      ]
    );
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async listByTenant(tenantId: string): Promise<DeployTargetRecord[]> {
    const rows = await this.db.query<DeployTargetRow>(
      `SELECT * FROM public.deploy_targets
       WHERE tenant_id = $1
       ORDER BY service_id, environment`,
      [tenantId]
    );
    return rows.map((row) => this.toRecord(row));
  }

  async upsert(input: UpsertDeployTargetInput): Promise<DeployTargetRecord> {
    const rows = await this.db.query<DeployTargetRow>(
      `INSERT INTO public.deploy_targets
         (id, tenant_id, service_id, environment, coolify_server_uuid, repo, branch,
          git_provider, auth_method, build_pack, ports_exposes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (tenant_id, service_id, environment)
       DO UPDATE SET
         coolify_server_uuid = COALESCE(EXCLUDED.coolify_server_uuid, deploy_targets.coolify_server_uuid),
         repo = EXCLUDED.repo,
         branch = EXCLUDED.branch,
         git_provider = EXCLUDED.git_provider,
         auth_method = EXCLUDED.auth_method,
         build_pack = EXCLUDED.build_pack,
         ports_exposes = EXCLUDED.ports_exposes,
         status = EXCLUDED.status,
         updated_at = now()
       RETURNING *`,
      [
        input.id,
        input.tenantId,
        input.serviceId,
        input.environment,
        input.coolifyServerUuid ?? null,
        input.repo,
        input.branch ?? "main",
        input.gitProvider ?? "github",
        input.authMethod ?? "deploy_key",
        input.buildPack ?? "nixpacks",
        input.portsExposes ?? "3000",
        input.status ?? "pending",
      ]
    );
    return this.toRecord(rows[0]);
  }

  async setStatus(
    tenantId: string,
    serviceId: string,
    environment: "staging" | "production",
    status: DeployTargetStatus,
    errorMessage?: string
  ): Promise<DeployTargetRecord> {
    const rows = await this.db.query<DeployTargetRow>(
      `UPDATE public.deploy_targets
       SET status = $4,
           error_message = $5,
           updated_at = now()
       WHERE tenant_id = $1 AND service_id = $2 AND environment = $3
       RETURNING *`,
      [tenantId, serviceId, environment, status, errorMessage ?? null]
    );
    if (!rows[0]) throw new NotFoundException("Deploy target not found");
    return this.toRecord(rows[0]);
  }

  async updateBranch(
    tenantId: string,
    serviceId: string,
    environment: "staging" | "production",
    branch: string
  ): Promise<DeployTargetRecord | null> {
    const rows = await this.db.query<DeployTargetRow>(
      `UPDATE public.deploy_targets
       SET branch = $4, updated_at = now()
       WHERE tenant_id = $1 AND service_id = $2 AND environment = $3
       RETURNING *`,
      [tenantId, serviceId, environment, branch]
    );
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async setCoolifyIds(
    tenantId: string,
    serviceId: string,
    environment: "staging" | "production",
    ids: {
      coolifyServerUuid?: string;
      coolifyProjectUuid?: string;
      coolifyAppUuid?: string;
      coolifyEnvUuid?: string;
      privateKeyUuid?: string;
      status?: DeployTargetStatus;
    }
  ): Promise<DeployTargetRecord> {
    const rows = await this.db.query<DeployTargetRow>(
      `UPDATE public.deploy_targets
       SET coolify_server_uuid = COALESCE($4, coolify_server_uuid),
           coolify_project_uuid = COALESCE($5, coolify_project_uuid),
           coolify_app_uuid = COALESCE($6, coolify_app_uuid),
           coolify_env_uuid = COALESCE($7, coolify_env_uuid),
           private_key_uuid = COALESCE($8, private_key_uuid),
           status = COALESCE($9, status),
           updated_at = now()
       WHERE tenant_id = $1 AND service_id = $2 AND environment = $3
       RETURNING *`,
      [
        tenantId,
        serviceId,
        environment,
        ids.coolifyServerUuid ?? null,
        ids.coolifyProjectUuid ?? null,
        ids.coolifyAppUuid ?? null,
        ids.coolifyEnvUuid ?? null,
        ids.privateKeyUuid ?? null,
        ids.status ?? null,
      ]
    );
    if (!rows[0]) throw new NotFoundException("Deploy target not found");
    return this.toRecord(rows[0]);
  }

  private toRecord(row: DeployTargetRow): DeployTargetRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      serviceId: row.service_id,
      environment: row.environment,
      coolifyServerUuid: row.coolify_server_uuid,
      coolifyProjectUuid: row.coolify_project_uuid,
      coolifyAppUuid: row.coolify_app_uuid,
      coolifyEnvUuid: row.coolify_env_uuid,
      repo: row.repo,
      branch: row.branch,
      gitProvider: row.git_provider,
      authMethod: row.auth_method as DeployTargetRecord["authMethod"],
      privateKeyUuid: row.private_key_uuid,
      buildPack: row.build_pack as DeployTargetRecord["buildPack"],
      portsExposes: row.ports_exposes,
      status: row.status,
      errorMessage: row.error_message,
      deployProfile: normalizeDeployProfile(row.deploy_profile),
      deployProfileOptions: (row.deploy_profile_options ?? {}) as DeployProfileOptions,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
