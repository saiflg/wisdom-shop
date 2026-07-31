import { Controller, Headers, HttpCode, HttpStatus, Post, Req, VERSION_NEUTRAL } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { PaymentsService } from "./payments.service";

/**
 * Provider webhook endpoints.
 *
 * These are @Public() because payment providers have no bearer token — the
 * signature check IS the authentication, so it happens before the payload is
 * trusted for anything. They're also VERSION_NEUTRAL: the URL gets configured
 * in a provider dashboard and shouldn't churn when the API version bumps.
 *
 * Requires the raw body (see configureApp in bootstrap.ts) because signatures
 * are computed over the exact bytes sent.
 */
@ApiTags("webhooks")
@Controller({ path: "webhooks", version: VERSION_NEUTRAL })
export class WebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Post("stripe")
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async stripe(@Req() req: Request, @Headers("stripe-signature") signature?: string) {
    // rawBody is populated by the express.json verify hook in bootstrap.ts.
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const result = await this.payments.handleStripeWebhook(rawBody ?? Buffer.alloc(0), signature);

    // Always 200 once the signature is valid. Returning a non-2xx for
    // business-level no-ops (duplicates, unhandled types) would make the
    // provider retry forever.
    return result;
  }

  @Public()
  @Post("paystack")
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async paystack(@Req() req: Request, @Headers("x-paystack-signature") signature?: string) {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    return this.payments.handlePaystackWebhook(rawBody ?? Buffer.alloc(0), signature);
  }

  @Public()
  @Post("flutterwave")
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async flutterwave(@Req() req: Request, @Headers("verif-hash") hash?: string) {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    return this.payments.handleFlutterwaveWebhook(rawBody ?? Buffer.alloc(0), hash);
  }

  @Public()
  @Post("paypal")
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async paypal(
    @Req() req: Request,
    // PayPal spreads its signature across five headers rather than one.
    @Headers("paypal-transmission-id") transmissionId?: string,
    @Headers("paypal-transmission-time") transmissionTime?: string,
    @Headers("paypal-transmission-sig") transmissionSig?: string,
    @Headers("paypal-cert-url") certUrl?: string,
    @Headers("paypal-auth-algo") authAlgo?: string,
  ) {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    return this.payments.handlePayPalWebhook(rawBody ?? Buffer.alloc(0), {
      transmissionId,
      transmissionTime,
      transmissionSig,
      certUrl,
      authAlgo,
    });
  }
}
