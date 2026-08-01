import { Module } from "@nestjs/common";
import { ProvisioningService } from "./provisioning.service";
import { MigrationRunner } from "./migration-runner";

@Module({
  providers: [ProvisioningService, MigrationRunner],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}
