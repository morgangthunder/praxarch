import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../common/database/database.service";
import {
  ASSISTANT_BEHAVIOR_KEY,
  ASSISTANT_GUARDRAIL_KEY,
  PROMPT_DEFINITIONS,
  PromptDefinition,
  PromptEntry,
  PromptScope,
  PromptSource,
} from "./prompt-registry.types";

interface PromptRow {
  prompt_key: string;
  body: string;
  version: number;
  updated_at: Date;
  label: string | null;
  scope: string | null;
  source: string;
}

/**
 * Platform-wide prompt registry. Built-in defaults live in code; super-admins can
 * override builtins or create custom prompts (duplicable). Custom prompts can be
 * associated with assistant cases via guardrail/behavior key selectors.
 */
@Injectable()
export class PromptRegistryService {
  private readonly logger = new Logger(PromptRegistryService.name);

  constructor(private readonly db: DatabaseService) {}

  private definition(key: string): PromptDefinition | undefined {
    return PROMPT_DEFINITIONS.find((d) => d.key === key);
  }

  /** Full catalogue: builtins (merged with overrides) + custom prompts. */
  async list(scope?: PromptScope): Promise<PromptEntry[]> {
    const overrides = await this.loadAllRows();
    const builtins = PROMPT_DEFINITIONS.map((def) => this.toBuiltinEntry(def, overrides.get(def.key)));
    const customs = [...overrides.values()]
      .filter((r) => r.source === "custom")
      .map((r) => this.toCustomEntry(r));
    const all = [...builtins, ...customs].sort((a, b) => a.label.localeCompare(b.label));
    return scope ? all.filter((p) => p.scope === scope) : all;
  }

  async get(key: string): Promise<PromptEntry> {
    const def = this.definition(key);
    if (def) {
      const row = (await this.loadAllRows()).get(key);
      return this.toBuiltinEntry(def, row);
    }
    const custom = (await this.loadAllRows()).get(key);
    if (custom?.source === "custom") return this.toCustomEntry(custom);
    throw new NotFoundException(`Unknown prompt key: ${key}`);
  }

  /** Resolve effective body for any key (builtin, override, or custom). */
  async resolveBody(key: string): Promise<string> {
    const row = (await this.loadAllRows()).get(key);
    if (row) return row.body;
    const def = this.definition(key);
    if (def) return def.defaultBody;
    throw new NotFoundException(`Unknown prompt key: ${key}`);
  }

  /** Save body — builtin override or custom prompt update. */
  async save(key: string, body: string): Promise<PromptEntry> {
    const def = this.definition(key);
    const existing = (await this.loadAllRows()).get(key);

    if (!def && existing?.source !== "custom") {
      throw new NotFoundException(`Unknown prompt key: ${key}`);
    }
    if (!this.db.enabled) {
      this.logger.warn("DB disabled — prompt not persisted.");
      if (def) return this.toBuiltinEntry(def, undefined);
      return this.toCustomEntry(existing!);
    }

    if (existing?.source === "custom") {
      const rows = await this.db.query<PromptRow>(
        `UPDATE public.assistant_prompts SET body = $2, version = version + 1, updated_at = now()
         WHERE prompt_key = $1 RETURNING *`,
        [key, body]
      );
      return this.toCustomEntry(rows[0]);
    }

    const rows = await this.db.query<PromptRow>(
      `INSERT INTO public.assistant_prompts (prompt_key, body, version, source)
       VALUES ($1, $2, 1, 'override')
       ON CONFLICT (prompt_key)
       DO UPDATE SET body = EXCLUDED.body,
                     version = public.assistant_prompts.version + 1,
                     updated_at = now()
       RETURNING *`,
      [key, body]
    );
    this.logger.log(`Prompt "${key}" saved → v${rows[0].version}`);
    return def ? this.toBuiltinEntry(def, rows[0]) : this.toCustomEntry(rows[0]);
  }

  /** Create a new custom prompt, optionally seeded from an existing key. */
  async create(input: {
    label: string;
    scope: PromptScope;
    body?: string;
    duplicateFrom?: string;
  }): Promise<PromptEntry> {
    if (!this.db.enabled) throw new BadRequestException("Database required to create custom prompts.");

    let body = input.body?.trim() ?? "";
    if (!body && input.duplicateFrom) {
      body = await this.resolveBody(input.duplicateFrom);
    }
    if (!body) body = `(${input.label} — edit this prompt.)`;

    const key = await this.uniqueKey(input.scope, input.label);
    const rows = await this.db.query<PromptRow>(
      `INSERT INTO public.assistant_prompts (prompt_key, body, version, label, scope, source)
       VALUES ($1, $2, 1, $3, $4, 'custom')
       RETURNING *`,
      [key, body, input.label, input.scope]
    );
    this.logger.log(`Custom prompt created: ${key}`);
    return this.toCustomEntry(rows[0]);
  }

  /** Resolve guardrail + behavior bodies for an assistant case. */
  async composeForCase(guardrailKey: string, behaviorKey: string): Promise<{ guardrail: string; behavior: string }> {
    const [guardrail, behavior] = await Promise.all([
      this.resolveBody(guardrailKey),
      this.resolveBody(behaviorKey),
    ]);
    return { guardrail, behavior };
  }

  /** @deprecated Use composeForCase with case keys. */
  async composeAssistantPrompts(): Promise<{ guardrail: string; behavior: string }> {
    return this.composeForCase(ASSISTANT_GUARDRAIL_KEY, ASSISTANT_BEHAVIOR_KEY);
  }

  private async uniqueKey(scope: PromptScope, label: string): Promise<string> {
    const base = `custom.${scope}.${slugify(label)}`;
    const rows = await this.loadAllRows();
    if (!rows.has(base)) return base;
    for (let i = 2; i < 100; i++) {
      const candidate = `${base}.${i}`;
      if (!rows.has(candidate)) return candidate;
    }
    return `${base}.${Date.now()}`;
  }

  private async loadAllRows(): Promise<Map<string, PromptRow>> {
    if (!this.db.enabled) return new Map();
    try {
      const rows = await this.db.query<PromptRow>(
        `SELECT prompt_key, body, version, updated_at, label, scope, source FROM public.assistant_prompts`
      );
      return new Map(rows.map((r) => [r.prompt_key, r]));
    } catch (err) {
      this.logger.warn(`Prompt rows unavailable: ${(err as Error).message}`);
      return new Map();
    }
  }

  private toBuiltinEntry(def: PromptDefinition, row?: PromptRow): PromptEntry {
    const source: PromptSource = row ? (row.source === "custom" ? "custom" : "override") : "builtin";
    return {
      key: def.key,
      label: def.label,
      scope: def.scope,
      live: def.live,
      version: row?.version ?? 1,
      body: row?.body ?? def.defaultBody,
      source,
      customised: !!row && row.body !== def.defaultBody,
      updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
  }

  private toCustomEntry(row: PromptRow): PromptEntry {
    return {
      key: row.prompt_key,
      label: row.label ?? row.prompt_key,
      scope: (row.scope as PromptScope) ?? "chat",
      live: false,
      version: row.version,
      body: row.body,
      source: "custom",
      customised: true,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "prompt";
}
