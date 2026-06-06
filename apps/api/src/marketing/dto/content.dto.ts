import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { ContentChannel, ContentStatus } from "../content.types";

const CHANNELS: ContentChannel[] = ["meta", "google", "tiktok", "linkedin", "email"];
const STATUSES: ContentStatus[] = ["draft", "awaiting", "scheduled", "published", "rejected"];

export class CreateContentDto {
  @IsOptional()
  @IsIn(CHANNELS)
  channel?: ContentChannel;

  @IsString()
  @MaxLength(140)
  title!: string;

  @IsString()
  @MaxLength(2200)
  body!: string;
}

export class UpdateContentStatusDto {
  @IsIn(STATUSES)
  status!: ContentStatus;
}
