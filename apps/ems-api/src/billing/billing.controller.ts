import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "@/auth/decorators/public.decorator";
import { PlatformJwtAuthGuard } from "@/platform-auth/guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "@/platform-auth/guards/platform-roles.guard";
import { PlatformRoles } from "@/platform-auth/decorators/platform-roles.decorator";
import { BillingService } from "./billing.service";
import { CreatePlanDto, GenerateInvoiceDto, SubscribeSchoolDto, UpdatePlanDto } from "./dto/billing.dto";

/**
 * Platform-admin only. Billing is deliberately decoupled from school
 * suspension: a PAST_DUE subscription does not lock a school out by itself.
 * Cutting off a customer stays an explicit operator decision with a
 * recorded reason — see SchoolsController.suspend.
 */
@ApiTags("platform-billing")
@ApiBearerAuth()
@Public()
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
@PlatformRoles("PLATFORM_ADMIN")
@Controller("platform/billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("plans")
  @ApiOperation({ summary: "List subscription plans" })
  listPlans() {
    return this.billing.listPlans();
  }

  @Post("plans")
  @ApiOperation({ summary: "Create a plan" })
  createPlan(@Body() dto: CreatePlanDto) {
    return this.billing.createPlan(dto);
  }

  @Patch("plans/:id")
  @ApiOperation({
    summary: "Update or retire a plan",
    description: "Repricing affects new subscriptions only; existing ones keep their snapshotted price.",
  })
  updatePlan(@Param("id") id: string, @Body() dto: UpdatePlanDto) {
    return this.billing.updatePlan(id, dto);
  }

  @Get("schools/:schoolId/subscription")
  @ApiOperation({ summary: "A school's subscription, or null" })
  getSubscription(@Param("schoolId") schoolId: string) {
    return this.billing.getSubscription(schoolId);
  }

  @Post("schools/:schoolId/subscription")
  @ApiOperation({ summary: "Subscribe a school to a plan" })
  subscribe(@Param("schoolId") schoolId: string, @Body() dto: SubscribeSchoolDto) {
    return this.billing.subscribe(schoolId, dto);
  }

  @Patch("schools/:schoolId/subscription/plan")
  @ApiOperation({ summary: "Move a school to a different plan from its next period" })
  changePlan(@Param("schoolId") schoolId: string, @Body() dto: SubscribeSchoolDto) {
    return this.billing.changePlan(schoolId, dto.planId);
  }

  @Patch("schools/:schoolId/subscription/activate")
  @ApiOperation({ summary: "Mark a subscription active" })
  activate(@Param("schoolId") schoolId: string) {
    return this.billing.setSubscriptionStatus(schoolId, "ACTIVE");
  }

  @Patch("schools/:schoolId/subscription/past-due")
  @ApiOperation({ summary: "Mark a subscription past due — does not suspend the school" })
  pastDue(@Param("schoolId") schoolId: string) {
    return this.billing.setSubscriptionStatus(schoolId, "PAST_DUE");
  }

  @Patch("schools/:schoolId/subscription/cancel")
  @ApiOperation({ summary: "Cancel a subscription" })
  cancel(@Param("schoolId") schoolId: string) {
    return this.billing.setSubscriptionStatus(schoolId, "CANCELED");
  }

  @Get("invoices")
  @ApiOperation({ summary: "List invoices, optionally for one school" })
  listInvoices(@Query("schoolId") schoolId?: string) {
    return this.billing.listInvoices(schoolId);
  }

  @Get("invoices/:number")
  @ApiOperation({ summary: "An invoice and its lines" })
  getInvoice(@Param("number") number: string) {
    return this.billing.getInvoice(number);
  }

  @Post("schools/:schoolId/invoices")
  @ApiOperation({ summary: "Generate a draft invoice for a school's current period" })
  generateInvoice(@Param("schoolId") schoolId: string, @Body() dto: GenerateInvoiceDto) {
    return this.billing.generateInvoice(schoolId, dto);
  }

  @Patch("invoices/:number/issue")
  @ApiOperation({ summary: "Issue a draft invoice" })
  issue(@Param("number") number: string) {
    return this.billing.setInvoiceStatus(number, "OPEN");
  }

  @Patch("invoices/:number/pay")
  @ApiOperation({ summary: "Record payment" })
  pay(@Param("number") number: string) {
    return this.billing.setInvoiceStatus(number, "PAID");
  }

  @Patch("invoices/:number/void")
  @ApiOperation({ summary: "Void an invoice" })
  voidInvoice(@Param("number") number: string) {
    return this.billing.setInvoiceStatus(number, "VOID");
  }

  @Patch("invoices/:number/uncollectible")
  @ApiOperation({ summary: "Write an invoice off as uncollectible" })
  uncollectible(@Param("number") number: string) {
    return this.billing.setInvoiceStatus(number, "UNCOLLECTIBLE");
  }

  @Get("revenue")
  @ApiOperation({
    summary: "Revenue summary",
    description: "Collected and outstanding are reported separately — invoiced is not received.",
  })
  revenue() {
    return this.billing.revenueSummary();
  }
}
