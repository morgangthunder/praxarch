import { Type } from "class-transformer";
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import type { DeployTargetBuildPack, DeployProfile } from "../deploy-targets.types";
import { EnvironmentTargetDto } from "./provision.dto";

/** Wizard save for an existing deployment — updates targets, secrets, and metadata. */
export class UpdateDeploymentDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(200)
  repo!: string;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stagingBranch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  productionBranch?: string;

  @IsOptional()
  @IsIn(["app", "service"])
  kind?: "app" | "service";

  @IsOptional()
  @IsIn(["nixpacks", "railpack", "static", "dockerfile", "dockercompose"])
  buildPack?: DeployTargetBuildPack;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  portsExposes?: string;

  @IsOptional()
  @IsString()
  githubToken?: string;

  @IsOptional()
  @IsIn(["local", "cloud-split", "cloud-single"])
  hosting?: "local" | "cloud-split" | "cloud-single";

  @IsOptional()
  @IsString()
  stagingEnvText?: string;

  @IsOptional()
  @IsString()
  productionEnvText?: string;

  @IsOptional()
  @IsIn(["coolify", "source-compose", "source-compose-host"])
  stagingDeployProfile?: DeployProfile;

  @IsOptional()
  @IsIn(["coolify", "source-compose", "source-compose-host"])
  productionDeployProfile?: DeployProfile;

  @ValidateNested()
  @Type(() => EnvironmentTargetDto)
  staging!: EnvironmentTargetDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EnvironmentTargetDto)
  production?: EnvironmentTargetDto;
}
