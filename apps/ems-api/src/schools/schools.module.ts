import { Module } from "@nestjs/common";
import { ProvisioningModule } from "@/provisioning/provisioning.module";
import { SchoolsController } from "./schools.controller";
import { SchoolsService } from "./schools.service";

@Module({
  imports: [ProvisioningModule],
  controllers: [SchoolsController],
  providers: [SchoolsService],
})
export class SchoolsModule {}
