import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateServiceDto {
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
}

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  repo?: string;

  /** @deprecated Sets both environments when stagingBranch/productionBranch are omitted. */
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
}
