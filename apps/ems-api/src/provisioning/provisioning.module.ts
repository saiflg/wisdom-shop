import { Module } from "@nestjs/common";
import { ProvisioningService } from "./provisioning.service";
import { MigrationRunner } from "./migration-runner";
import { FleetMigrationsService } from "./fleet-migrations.service";

@Module({
  providers: [ProvisioningService, MigrationRunner, FleetMigrationsService],
  exports: [ProvisioningService, FleetMigrationsService],
})
export class ProvisioningModule {}
