import { Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PaymentsService } from "./payments.service";

@ApiTags("payments")
@ApiBearerAuth()
@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get("providers")
  @ApiOperation({ summary: "Which payment providers are configured on this deployment" })
  providers() {
    return this.payments.availableProviders();
  }

  @Post("stripe/checkout/:orderNumber")
  @ApiOperation({
    summary: "Start a Stripe Checkout Session for one of your PENDING orders",
    description:
      "Returns a redirectUrl to send the customer to. Responds 503 if STRIPE_SECRET_KEY is not configured, and 409 if the order is not PENDING.",
  })
  startStripeCheckout(@CurrentUser("id") userId: string, @Param("orderNumber") orderNumber: string) {
    return this.payments.startStripeCheckout(userId, orderNumber);
  }

  @Post("paystack/checkout/:orderNumber")
  @ApiOperation({
    summary: "Start a Paystack transaction for one of your PENDING orders",
    description:
      "Returns a redirectUrl (Paystack authorization URL). Responds 503 if PAYSTACK_SECRET_KEY is not configured, and 409 if the order is not PENDING.",
  })
  startPaystackCheckout(@CurrentUser("id") userId: string, @Param("orderNumber") orderNumber: string) {
    return this.payments.startPaystackCheckout(userId, orderNumber);
  }

  @Post("flutterwave/checkout/:orderNumber")
  @ApiOperation({
    summary: "Start a Flutterwave payment for one of your PENDING orders",
    description: "503 if no Flutterwave secret key is configured, 409 if the order is not PENDING.",
  })
  startFlutterwaveCheckout(@CurrentUser("id") userId: string, @Param("orderNumber") orderNumber: string) {
    return this.payments.startFlutterwaveCheckout(userId, orderNumber);
  }

  @Post("paypal/checkout/:orderNumber")
  @ApiOperation({
    summary: "Start a PayPal order for one of your PENDING orders",
    description: "503 if no PayPal credentials are configured, 409 if the order is not PENDING.",
  })
  startPayPalCheckout(@CurrentUser("id") userId: string, @Param("orderNumber") orderNumber: string) {
    return this.payments.startPayPalCheckout(userId, orderNumber);
  }

  @Get(":orderNumber")
  @ApiOperation({ summary: "Payment attempts recorded against one of your orders" })
  list(@CurrentUser("id") userId: string, @Param("orderNumber") orderNumber: string) {
    return this.payments.listForOrder(userId, orderNumber);
  }
}
