import { Module } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { WebhooksController } from "./webhooks.controller";
import { RefundsController } from "./refunds.controller";
import { RefundsService } from "./refunds.service";
import { StripeProvider } from "./providers/stripe.provider";
import { PaystackProvider } from "./providers/paystack.provider";
import { FlutterwaveProvider } from "./providers/flutterwave.provider";
import { PayPalProvider } from "./providers/paypal.provider";
import { LicensesModule } from "../licenses/licenses.module";

@Module({
  imports: [LicensesModule],
  controllers: [PaymentsController, WebhooksController, RefundsController],
  providers: [
    PaymentsService,
    RefundsService,
    StripeProvider,
    PaystackProvider,
    FlutterwaveProvider,
    PayPalProvider,
  ],
  exports: [PaymentsService, RefundsService],
})
export class PaymentsModule {}
