import { IsString, MaxLength, MinLength } from "class-validator";

export class SavePromptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  body!: string;
}
