import { Type } from "class-transformer";
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import type { DeployTargetBuildPack, DeployProfile } from "../deploy-targets.types";

export class EnvironmentTargetDto {
  @IsString()
  @MaxLength(80)
  serverUuid!: string;
}

export class ProvisionDeploymentDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(200)
  repo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
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

  /** `.env`-style lines — stored in vault and synced to Coolify after provision. */
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

  /** Omitted when cloud-split wizard skips production until later. */
  @IsOptional()
  @ValidateNested()
  @Type(() => EnvironmentTargetDto)
  production?: EnvironmentTargetDto;
}
