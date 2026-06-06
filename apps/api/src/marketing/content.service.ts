import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../common/database/database.service";
import { ContentDraftRecord, ContentStatus } from "./content.types";
import { CreateContentDto } from "./dto/content.dto";

interface ContentRow {
  id: string;
  channel: ContentDraftRecord["channel"];
  title: string;
  body: string;
  status: ContentStatus;
  created_at: Date;
}

function defaultDrafts(tenant: string): ContentDraftRecord[] {
  const now = new Date().toISOString();
  return [
    { id: `${tenant}_ct1`, channel: "meta", title: "Summer launch — carousel", body: "Meet the new collection. Tap to shop the drop before it's gone. ☀️", status: "awaiting", createdAt: now },
    { id: `${tenant}_ct2`, channel: "tiktok", title: "Creator hook — 15s", body: "POV: you found the only thing you need this summer.", status: "awaiting", createdAt: now },
    { id: `${tenant}_ct3`, channel: "email", title: "Reactivation — win-back", body: "We saved your cart. Here's 10% to finish checkout.", status: "draft", createdAt: now },
  ];
}

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(private readonly db: DatabaseService) {}

  async list(tenantId: string): Promise<ContentDraftRecord[]> {
    const rows = await this.db.query<ContentRow>(
      `SELECT id, channel, title, body, status, created_at FROM public.content_drafts
       WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    if (rows.length > 0) return rows.map(this.toRecord);

    const seeded = defaultDrafts(tenantId);
    for (const d of seeded) await this.insert(tenantId, d);
    this.logger.log(`Seeded ${seeded.length} default content drafts for ${tenantId}`);
    return seeded;
  }

  async create(tenantId: string, dto: CreateContentDto): Promise<ContentDraftRecord> {
    const record: ContentDraftRecord = {
      id: `${tenantId}_ct_${Date.now()}`,
      channel: dto.channel ?? "meta",
      title: dto.title,
      body: dto.body,
      status: "draft",
      createdAt: new Date().toISOString(),
    };
    await this.insert(tenantId, record);
    this.logger.log(`Created content draft ${tenantId}/${record.id}`);
    return record;
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: ContentStatus
  ): Promise<ContentDraftRecord | null> {
    const rows = await this.db.query<ContentRow>(
      `UPDATE public.content_drafts SET status = $3
       WHERE tenant_id = $1 AND id = $2
       RETURNING id, channel, title, body, status, created_at`,
      [tenantId, id, status]
    );
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  private async insert(tenantId: string, d: ContentDraftRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO public.content_drafts (id, tenant_id, channel, title, body, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tenant_id, id) DO NOTHING`,
      [d.id, tenantId, d.channel, d.title, d.body, d.status, d.createdAt]
    );
  }

  private toRecord(r: ContentRow): ContentDraftRecord {
    return {
      id: r.id,
      channel: r.channel,
      title: r.title,
      body: r.body,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }
}
