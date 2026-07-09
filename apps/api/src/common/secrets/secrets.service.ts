import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { DatabaseService } from "../database/database.service";

interface SecretRow {
  ciphertext: string;
}

/**
 * Local dev vault — AES-256-GCM encrypted blobs in Postgres.
 * Production: swap for AWS Secrets Manager (documented in 1.5e).
 */
@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService
  ) {}

  async put(tenantId: string, key: string, value: string): Promise<void> {
    const ciphertext = this.encrypt(value);
    await this.db.query(
      `INSERT INTO public.tenant_secrets (tenant_id, secret_key, ciphertext)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, secret_key)
       DO UPDATE SET ciphertext = EXCLUDED.ciphertext, updated_at = now()`,
      [tenantId, key, ciphertext]
    );
  }

  async get(tenantId: string, key: string): Promise<string | null> {
    const rows = await this.db.query<SecretRow>(
      `SELECT ciphertext FROM public.tenant_secrets WHERE tenant_id = $1 AND secret_key = $2`,
      [tenantId, key]
    );
    if (!rows[0]) return null;
    return this.decrypt(rows[0].ciphertext);
  }

  private encKey(): Buffer {
    const raw = this.config.get<string>("SECRETS_ENC_KEY") ?? "praxarch-dev-secrets-key-change-me";
    if (!this.config.get<string>("SECRETS_ENC_KEY")) {
      this.logger.warn("SECRETS_ENC_KEY not set — using insecure dev default");
    }
    return scryptSync(raw, "praxarch-salt", 32);
  }

  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encKey(), iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString("base64");
  }

  private decrypt(blob: string): string {
    const buf = Buffer.from(blob, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.encKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }
}
