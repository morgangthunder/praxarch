import { Module } from "@nestjs/common";
import { GitHubService } from "./github.service";
import { SecretsService } from "./secrets.service";

@Module({
  providers: [SecretsService, GitHubService],
  exports: [SecretsService, GitHubService],
})
export class SecretsModule {}
