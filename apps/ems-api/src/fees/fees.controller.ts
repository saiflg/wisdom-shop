import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { FeesService } from "./fees.service";
import { DiscountsService } from "./discounts.service";
import {
  CreateFeeInvoiceDto,
  CreateFeeStructureDto,
  GenerateInvoicesDto,
  RecordPaymentDto,
  UpdateFeeStructureDto,
  UpdateFinanceSettingsDto,
  VoidInvoiceDto,
} from "./dto/fees.dto";
import { AwardScholarshipDto, GrantDiscountDto, WithdrawScholarshipDto } from "./dto/discounts.dto";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";

@ApiTags("fees")
@ApiBearerAuth()
@RequiresModule("FEES")
@Controller("fees")
export class FeesController {
  constructor(
    private readonly fees: FeesService,
    private readonly discounts: DiscountsService,
  ) {}

  @Get("scholarships")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Standing awards, and how many bills each has actually reduced",
    description: "An award nobody has used is worth questioning, so the count is shown.",
  })
  listScholarships(@Query("studentProfileId") studentProfileId?: string) {
    return this.discounts.listAwards(studentProfileId);
  }

  @Post("scholarships")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Award a scholarship to a student",
    description:
      "Standing: it reduces every invoice raised while it runs, including ones that do not exist yet. That is " +
      "the difference between this and a discount.",
  })
  award(@Body() dto: AwardScholarshipDto, @CurrentUser() user: AuthenticatedUser) {
    return this.discounts.award(dto, user);
  }

  @Patch("scholarships/:id/withdraw")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Stop an award",
    description:
      "Withdrawn, never deleted: the discounts it already granted stay on the invoices they were granted " +
      "against, because a school has to be able to explain a bill it has already sent.",
  })
  withdrawScholarship(@Param("id") id: string, @Body() dto: WithdrawScholarshipDto) {
    return this.discounts.withdraw(id, dto.reason);
  }

  @Get("invoices/:id/discounts")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "What has been taken off one invoice, and what it now comes to" })
  invoiceDiscounts(@Param("id") id: string) {
    return this.discounts.forInvoice(id);
  }

  @Post("invoices/:id/discounts")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Take money off one invoice",
    description:
      "Refused if it would take the payable amount below what the family has already paid — that is not a " +
      "discount, it is a refund, and refunds are not modelled here.",
  })
  grantDiscount(
    @Param("id") id: string,
    @Body() dto: GrantDiscountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.discounts.grant(id, dto, user);
  }

  @Delete("discounts/:id")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Undo a discount. The money goes back on the bill; payments are untouched." })
  revokeDiscount(@Param("id") id: string) {
    return this.discounts.revoke(id);
  }


  @Get("settings")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "This school's finance settings" })
  getSettings() {
    return this.fees.getSettings();
  }

  @Patch("settings")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Update finance settings",
    description: "The currency is locked once any invoice exists, because every stored amount is in its minor units.",
  })
  updateSettings(@Body() dto: UpdateFinanceSettingsDto) {
    return this.fees.updateSettings(dto);
  }

  @Get("summary")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Collected and outstanding, reported separately" })
  summary() {
    return this.fees.summary();
  }

  @Post("structures")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Define what a term costs" })
  createStructure(@Body() dto: CreateFeeStructureDto) {
    return this.fees.createStructure(dto);
  }

  @Get("structures")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "List fee structures" })
  listStructures() {
    return this.fees.listStructures();
  }

  @Get("structures/:id")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "One fee structure and its items" })
  getStructure(@Param("id") id: string) {
    return this.fees.getStructure(id);
  }

  @Patch("structures/:id")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Rename or reprice a structure",
    description: "Invoices already raised keep their own line snapshot and are never repriced.",
  })
  updateStructure(@Param("id") id: string, @Body() dto: UpdateFeeStructureDto) {
    return this.fees.updateStructure(id, dto);
  }

  @Delete("structures/:id")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Retire a fee structure" })
  deleteStructure(@Param("id") id: string) {
    return this.fees.deleteStructure(id);
  }

  @Post("structures/:id/invoices")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Raise invoices for every student the structure applies to",
    description:
      "Idempotent: running it again after adding a student invoices only the new one. Duplicates are reported, " +
      "not raised as errors.",
  })
  generateInvoices(@Param("id") id: string, @Body() dto: GenerateInvoicesDto) {
    return this.fees.generateInvoices(id, dto);
  }

  @Post("invoices")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Raise a one-off invoice not tied to a structure" })
  createInvoice(@Body() dto: CreateFeeInvoiceDto) {
    return this.fees.createInvoice(dto);
  }

  @Get("invoices")
  @ApiQuery({ name: "studentProfileId", required: false })
  @ApiOperation({
    summary: "Invoices — guardians and students see only their own",
    description: "The filter can only narrow what a family may see, never widen it.",
  })
  listInvoices(@CurrentUser() user: AuthenticatedUser, @Query("studentProfileId") studentProfileId?: string) {
    return this.fees.listInvoices(user, studentProfileId);
  }

  @Get("invoices/:id")
  @ApiOperation({
    summary: "One invoice with its lines and payments",
    description: "A family asking for someone else's invoice gets a 404, not a 403.",
  })
  getInvoice(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.fees.getInvoice(id, user);
  }

  @Post("invoices/:id/payments")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Record money received",
    description:
      "Overpayment is refused. A reference, when given, is unique per invoice, so a replayed webhook cannot " +
      "credit twice.",
  })
  recordPayment(
    @Param("id") id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fees.recordPayment(id, dto, user);
  }

  @Post("invoices/:id/void")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Void an invoice raised in error",
    description: "Not a delete — a family may already have been sent it. Refused once payments exist.",
  })
  voidInvoice(@Param("id") id: string, @Body() dto: VoidInvoiceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.fees.voidInvoice(id, dto, user);
  }
}
