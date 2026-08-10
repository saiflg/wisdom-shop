import { Controller, Headers, Param, Post, RawBodyRequest, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "@/auth/decorators/public.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";
import { FeeCheckoutService } from "./fee-checkout.service";
import type { FeeProvider } from "./fee-checkout";

@ApiTags("fee-checkout")
@Controller()
export class FeeCheckoutController {
  constructor(private readonly checkout: FeeCheckoutService) {}

  @Post("fees/invoices/:id/checkout")
  @ApiBearerAuth()
  @RequiresModule("FEES")
  @ApiOperation({
    summary: "Start an online payment for one invoice",
    description:
      "Returns where to send the payer. Refuses clearly when the school has not configured a gateway — a family should be told to pay the office, not handed a broken redirect.",
  })
  start(@Param("id") invoiceId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.checkout.startCheckout(invoiceId, user);
  }

  /**
   * A payment provider calling us back.
   *
   * `@Public` by necessity — a gateway has no login — so the signature is the
   * only thing between a stranger and a credited invoice. The school is named
   * in the path because each configures its own webhook URL; a wrong slug
   * fails the signature check, since the secret belongs to that school.
   *
   * Deliberately NOT module-gated: a school that switches fees off after a
   * parent has already been redirected to a gateway must still record the
   * money that arrives.
   */
  @Public()
  @Post("fees/webhooks/:provider/:schoolSlug")
  @ApiOperation({ summary: "Payment provider webhook (signed, unauthenticated)" })
  async webhook(
    @Param("provider") provider: string,
    @Param("schoolSlug") schoolSlug: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-paystack-signature") paystackSignature?: string,
    @Headers("verif-hash") flutterwaveHash?: string,
  ) {
    const normalised = provider.toUpperCase() as FeeProvider;
    await this.checkout.handleWebhook({
      schoolSlug,
      provider: normalised,
      // Never `req.body`: the signature covers the exact bytes sent, and
      // anything that re-encodes them invalidates it.
      rawBody: req.rawBody ?? Buffer.alloc(0),
      signatureHeader: paystackSignature ?? flutterwaveHash,
    });

    // Always 200, always the same body. A provider retries on anything else,
    // and a caller must not be able to tell a rejected signature from an
    // unknown school by watching status codes.
    return { received: true };
  }
}
