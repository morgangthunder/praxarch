import { IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";

/**
 * A Member's request to promote a service to production. Instead of deploying,
 * this opens a WhatsApp HITL checkpoint for an Owner to approve.
 */
export class PromoteRequestDto {
  @IsString()
  @Matches(/^[a-z0-9-]{2,64}$/, { message: "project must be kebab-case slug" })
  project!: string;

  @IsIn(["staging", "production"])
  environment!: "staging" | "production";

  @IsOptional()
  @IsString()
  ref?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  /** Optional human-friendly context shown in the WhatsApp message. */
  @IsOptional()
  @IsString()
  @MaxLength(280)
  summary?: string;
}

export interface PromoteRequestResult {
  checkpointId: string;
  status: "awaiting_approval";
}
