import { Module } from "@nestjs/common";
import { GuardiansController } from "./guardians.controller";
import { InvitationsController } from "./invitations.controller";
import { GuardiansService } from "./guardians.service";
import { GuardianInvitationsService } from "./guardian-invitations.service";

@Module({
  controllers: [GuardiansController, InvitationsController],
  providers: [GuardiansService, GuardianInvitationsService],
  exports: [GuardianInvitationsService],
})
export class GuardiansModule {}
