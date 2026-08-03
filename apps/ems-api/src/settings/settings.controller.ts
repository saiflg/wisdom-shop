import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { PaymentProvider } from "ems-tenant-client";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CommunicationSettingsService } from "./communication-settings.service";
import { PaymentSettingsService } from "./payment-settings.service";
import { GatewayTestService } from "./gateway-test.service";
import {
  TestEmailDto,
  TestSmsDto,
  TestWhatsAppDto,
  UpdateEmailGatewayDto,
  UpdatePushGatewayDto,
  UpdateSmsGatewayDto,
  UpdateWhatsAppGatewayDto,
} from "./dto/communication-settings.dto";
import { PaymentProviderParamDto, UpdatePaymentGatewayDto } from "./dto/payment-settings.dto";

/**
 * SCHOOL_ADMIN only, on every route — gateway credentials are the most
 * sensitive data in a tenant, and a teacher has no reason to read even a
 * masked hint of them.
 */
@ApiTags("settings")
@ApiBearerAuth()
@Roles("SCHOOL_ADMIN")
@Controller("settings")
export class SettingsController {
  constructor(
    private readonly communication: CommunicationSettingsService,
    private readonly payments: PaymentSettingsService,
    private readonly tests: GatewayTestService,
  ) {}

  // ── Communication ────────────────────────────────────────────────────
  @Get("communication")
  @ApiOperation({ summary: "All communication gateways, with secrets masked" })
  getCommunication() {
    return this.communication.getAll();
  }

  @Patch("communication/email")
  @ApiOperation({ summary: "Update the email (SMTP) gateway" })
  updateEmail(@Body() dto: UpdateEmailGatewayDto) {
    return this.communication.updateEmail(dto);
  }

  @Patch("communication/sms")
  @ApiOperation({ summary: "Update the SMS gateway" })
  updateSms(@Body() dto: UpdateSmsGatewayDto) {
    return this.communication.updateSms(dto);
  }

  @Patch("communication/whatsapp")
  @ApiOperation({ summary: "Update the WhatsApp Business gateway" })
  updateWhatsApp(@Body() dto: UpdateWhatsAppGatewayDto) {
    return this.communication.updateWhatsApp(dto);
  }

  @Patch("communication/push")
  @ApiOperation({ summary: "Update the push notification gateway" })
  updatePush(@Body() dto: UpdatePushGatewayDto) {
    return this.communication.updatePush(dto);
  }

  @Post("communication/email/test")
  @ApiOperation({ summary: "Send a test email using this school's own SMTP settings" })
  testEmail(@Body() dto: TestEmailDto) {
    return this.tests.testEmail(dto.to);
  }

  @Post("communication/sms/test")
  @ApiOperation({ summary: "Send a test SMS" })
  testSms(@Body() dto: TestSmsDto) {
    return this.tests.testSms(dto.to);
  }

  @Post("communication/whatsapp/test")
  @ApiOperation({ summary: "Send a test WhatsApp message" })
  testWhatsApp(@Body() dto: TestWhatsAppDto) {
    return this.tests.testWhatsApp(dto.to);
  }

  // ── Payments ─────────────────────────────────────────────────────────
  @Get("payments")
  @ApiOperation({ summary: "All payment gateways, with secrets masked" })
  listPayments() {
    return this.payments.list();
  }

  @Get("payments/:provider")
  @ApiOperation({ summary: "One payment gateway" })
  getPayment(@Param() params: PaymentProviderParamDto) {
    return this.payments.get(params.provider as PaymentProvider);
  }

  @Patch("payments/:provider")
  @ApiOperation({ summary: "Update one payment gateway" })
  updatePayment(@Param() params: PaymentProviderParamDto, @Body() dto: UpdatePaymentGatewayDto) {
    return this.payments.update(params.provider as PaymentProvider, dto);
  }

  @Post("payments/:provider/test")
  @ApiOperation({ summary: "Verify the stored credentials — does not create a payment" })
  testPayment(@Param() params: PaymentProviderParamDto) {
    return this.payments.test(params.provider as PaymentProvider);
  }
}
