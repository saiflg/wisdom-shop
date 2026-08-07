import { Module } from "@nestjs/common";
import { TenantSecretsService } from "@/common/crypto/tenant-secrets.service";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";

@Module({
  controllers: [StaffController],
  providers: [StaffService, TenantSecretsService],
  exports: [StaffService],
})
export class StaffModule {}
