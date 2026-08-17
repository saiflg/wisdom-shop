import { Module } from "@nestjs/common";
import { MessagingModule } from "@/messaging/messaging.module";
import { FeesController } from "./fees.controller";
import { FeeCheckoutController } from "./fee-checkout.controller";
import { FeesService } from "./fees.service";
import { DiscountsService } from "./discounts.service";
import { FeeCheckoutService } from "./fee-checkout.service";

@Module({
  imports: [MessagingModule],
  controllers: [FeesController, FeeCheckoutController],
  providers: [FeesService, FeeCheckoutService, DiscountsService],
  exports: [FeesService],
})
export class FeesModule {}
