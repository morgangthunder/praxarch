import { IsBoolean, IsObject, IsOptional } from "class-validator";

export class InvokeCapabilityDto {
  /** Capability input; shape is validated by the capability's own schema. */
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;

  /** Force the WhatsApp approval path even if the caller could run it directly. */
  @IsOptional()
  @IsBoolean()
  requestApproval?: boolean;
}
