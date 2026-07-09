import { IsString, MaxLength } from "class-validator";

export class VerifyGitHubAccessDto {
  @IsString()
  @MaxLength(200)
  repo!: string;

  @IsString()
  githubToken!: string;
}
