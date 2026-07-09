import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import type { PromptScope } from "../prompt-registry.types";

const SCOPES = ["guardrail", "chat", "strategist", "creative", "analyst", "buyer"] as const;

export class CreatePromptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsIn(SCOPES)
  scope!: PromptScope;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  body?: string;

  /** Copy body from an existing prompt key (builtin or custom) as a starter. */
  @IsOptional()
  @IsString()
  duplicateFrom?: string;
}
