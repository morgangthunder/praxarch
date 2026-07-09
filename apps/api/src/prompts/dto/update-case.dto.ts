import { IsIn, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import type { ContextFieldsConfig } from "../ai-case.types";
import { MODEL_PROVIDERS } from "../ai-case.types";

const PROVIDER_IDS = MODEL_PROVIDERS.map((p) => p.id);

export class UpdateCaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsIn(PROVIDER_IDS)
  modelProvider?: (typeof PROVIDER_IDS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  apiBaseUrl?: string | null;

  @IsOptional()
  @IsString()
  guardrailPromptKey?: string;

  @IsOptional()
  @IsString()
  behaviorPromptKey?: string;

  @IsOptional()
  @IsObject()
  contextFields?: ContextFieldsConfig;
}
