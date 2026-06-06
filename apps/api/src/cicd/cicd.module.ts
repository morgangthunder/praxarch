import { Module } from "@nestjs/common";
import { CicdController } from "./cicd.controller";
import { CicdService } from "./cicd.service";
import { DeployRunsService } from "./deploy-runs.service";
import { ServicesService } from "./services.service";

@Module({
  controllers: [CicdController],
  providers: [CicdService, DeployRunsService, ServicesService],
  exports: [CicdService, DeployRunsService, ServicesService],
})
export class CicdModule {}
