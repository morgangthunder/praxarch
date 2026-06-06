import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import type { SocialPlatform } from "../../marketing/contracts";

const PLATFORMS: SocialPlatform[] = [
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "x",
  "youtube",
];

/**
 * A request to publish AI-generated content. Opens a WhatsApp HITL checkpoint;
 * an approver's "YES" runs the publish through the Marketing OS adapter.
 */
export class PublishRequestDto {
  @IsString()
  brandId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(PLATFORMS, { each: true })
  platforms!: SocialPlatform[];

  @IsString()
  @MaxLength(2200)
  caption!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsString()
  scheduledAt?: string;

  /** Optional human-friendly context for the WhatsApp message. */
  @IsOptional()
  @IsString()
  @MaxLength(280)
  summary?: string;
}

export interface PublishRequestResult {
  checkpointId: string;
  status: "awaiting_approval";
}
