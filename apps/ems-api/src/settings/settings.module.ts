import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { CommunicationSettingsService } from "./communication-settings.service";
import { PaymentSettingsService } from "./payment-settings.service";
import { GatewayTestService } from "./gateway-test.service";

@Module({
  controllers: [SettingsController],
  providers: [CommunicationSettingsService, PaymentSettingsService, GatewayTestService],
  exports: [CommunicationSettingsService, PaymentSettingsService],
})
export class SettingsModule {}
