import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class CreateCoolifyServerDto {
  @IsString()
  @MaxLength(60)
  name!: string;

  @IsString()
  @MaxLength(255)
  host!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  user?: string;

  @IsString()
  sshPrivateKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsIn(["traefik", "caddy", "none"])
  proxyType?: "traefik" | "caddy" | "none";
}
