import { Module } from "@nestjs/common";
import { TenantSecretsService } from "@/common/crypto/tenant-secrets.service";
import { GuardiansModule } from "@/guardians/guardians.module";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";
import { LeaveService } from "./leave.service";

@Module({
  // For GuardianInvitationsService. The invitation mechanism was written for
  // parents and is identical for staff, so it is imported rather than copied
  // — two implementations of "prove you own this address before choosing a
  // password" is one more than anybody should have to keep correct.
  imports: [GuardiansModule],
  controllers: [StaffController],
  providers: [StaffService, LeaveService, TenantSecretsService],
  exports: [StaffService],
})
export class StaffModule {}
