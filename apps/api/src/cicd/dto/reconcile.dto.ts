import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class ReconcileServerDto {
  /** Container names to stop & remove so Coolify can take over. Data volumes are preserved. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  stopContainers?: string[];

  /** Set the Coolify server proxy to "none" — keep an existing nginx/Caddy front door. */
  @IsOptional()
  @IsBoolean()
  setProxyNone?: boolean;

  /** Retarget nginx proxy_pass ports with no listener to this Coolify app port (e.g. 3303). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  retargetDeadNginxUpstreamsTo?: number;
}
