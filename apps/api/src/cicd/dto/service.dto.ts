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
  @IsIn(["app", "service"])
  kind?: "app" | "service";
}

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  repo?: string;

  @IsOptional()
  @IsString()
  branch?: string;
}
