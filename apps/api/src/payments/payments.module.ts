import { Module } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { WebhooksController } from "./webhooks.controller";
import { StripeProvider } from "./providers/stripe.provider";
import { PaystackProvider } from "./providers/paystack.provider";
import { LicensesModule } from "../licenses/licenses.module";

@Module({
  imports: [LicensesModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [PaymentsService, StripeProvider, PaystackProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
