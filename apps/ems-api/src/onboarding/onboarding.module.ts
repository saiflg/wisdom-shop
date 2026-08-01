import { Module } from "@nestjs/common";
import { ProvisioningModule } from "@/provisioning/provisioning.module";
import { AuthModule } from "@/auth/auth.module";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";

@Module({
  imports: [ProvisioningModule, AuthModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
