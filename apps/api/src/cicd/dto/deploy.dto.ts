import { IsIn, IsOptional, IsString, Matches } from "class-validator";

export class DeployRequestDto {
  /** Project / application key registered in Coolify. */
  @IsString()
  @Matches(/^[a-z0-9-]{2,64}$/, { message: "project must be kebab-case slug" })
  project!: string;

  @IsIn(["staging", "production"])
  environment!: "staging" | "production";

  /** Optional explicit git ref; defaults to the environment's tracked branch. */
  @IsOptional()
  @IsString()
  ref?: string;
}

export interface DeployResult {
  deploymentId: string;
  project: string;
  environment: string;
  status: "queued";
  tag: string;
}
