import { Body, Controller, Get, Header, Param, Patch, Post, Put, Res } from "@nestjs/common";
import type { Response } from "express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { PayrollService } from "./payroll.service";
import { PayslipPdfService } from "./payslip-pdf.service";
import { VoucherService } from "./voucher.service";
import { SetSalaryComponentsDto } from "./dto/set-salary-components.dto";
import { CreatePayrollRunDto } from "./dto/create-payroll-run.dto";
import { DownloadVoucherDto } from "./dto/download-voucher.dto";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";

/**
 * Payroll.
 *
 * SCHOOL_ADMIN throughout, including reads: a teacher must not be able to
 * look up a colleague's salary, and a payroll list is a list of salaries.
 */
@ApiTags("payroll")
@ApiBearerAuth()
@Roles("SCHOOL_ADMIN")
@RequiresModule("PAYROLL")
@Controller("payroll")
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly pdf: PayslipPdfService,
    private readonly voucher: VoucherService,
  ) {}

  @Get("runs/:id/voucher")
  @ApiOperation({ summary: "The whole run as a voucher, with page subtotals" })
  buildVoucher(@Param("id") id: string) {
    // Account numbers stay masked here. This feeds a screen, and a screen is
    // read over somebody's shoulder.
    return this.voucher.build(id, { revealAccountNumbers: false });
  }

  @Post("runs/:id/voucher.xlsx")
  @ApiOperation({
    summary: "Download the salary voucher as a spreadsheet",
    description:
      "A POST rather than a GET because it is an audited disclosure of every staff bank account, not a page view.",
  })
  async voucherWorkbook(
    @Param("id") id: string,
    @Body() dto: DownloadVoucherDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    // Revealing fifty account numbers at once is a bigger disclosure than the
    // single guarded reveal on a staff record. It defaults to masked, and the
    // service writes one access-log row per person — refusing to reveal at
    // all without a named viewer.
    const { buffer, filename } = await this.voucher.toWorkbook(id, {
      revealAccountNumbers: dto.includeAccountNumbers === true,
      viewer: { id: user.id },
      rowsPerPage: dto.rowsPerPage,
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get("staff/:userId/components")
  @ApiOperation({ summary: "A staff member's salary, with a preview of what it comes to" })
  getComponents(@Param("userId") userId: string) {
    return this.payroll.getComponents(userId);
  }

  @Put("staff/:userId/components")
  @ApiOperation({
    summary: "Replace a staff member's salary",
    description: "Wholesale rather than piecemeal, so the lines are always consistent with each other.",
  })
  setComponents(@Param("userId") userId: string, @Body() dto: SetSalaryComponentsDto) {
    return this.payroll.setComponents(userId, dto);
  }

  @Get("runs")
  @ApiOperation({ summary: "Every payroll run, most recent first" })
  listRuns() {
    return this.payroll.listRuns();
  }

  @Post("runs")
  @ApiOperation({
    summary: "Open a month's payroll",
    description: "409 if that month has already been run — a month cannot be paid twice.",
  })
  createRun(@Body() dto: CreatePayrollRunDto) {
    return this.payroll.createRun(dto);
  }

  @Get("runs/:id")
  @ApiOperation({ summary: "One run, its payslips and its totals" })
  getRun(@Param("id") id: string) {
    return this.payroll.getRun(id);
  }

  @Post("runs/:id/refresh")
  @ApiOperation({ summary: "Recompute a draft from current salaries" })
  refresh(@Param("id") id: string) {
    return this.payroll.refreshRun(id);
  }

  @Patch("runs/:id/approve")
  @ApiOperation({
    summary: "Approve a run",
    description: "Freezes its payslips. A later pay rise cannot rewrite an approved month.",
  })
  approve(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payroll.approve(id, user);
  }

  @Patch("runs/:id/paid")
  @ApiOperation({
    summary: "Record that the bank has been instructed",
    description: "Recorded, never performed — this software does not move money.",
  })
  markPaid(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payroll.markPaid(id, user);
  }

  @Post("runs/:id/transfer-file")
  @ApiOperation({
    summary: "The CSV a bursar takes to the bank",
    description:
      "The one route that returns full account numbers. Every disclosure is written to the bank-detail " +
      "access log before the file is produced. Staff with no account on file are listed, never dropped.",
  })
  async transferFile(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const file = await this.payroll.transferFile(id, user);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    // So the caller can warn about anyone who will not be paid without
    // having to parse the file to find out.
    res.setHeader("X-Payroll-Paid-Count", String(file.paidCount));
    res.setHeader("X-Payroll-Missing-Count", String(file.missing.length));
    res.send(file.csv);
  }

  @Get("payslips/:id")
  @ApiOperation({ summary: "One payslip, account number masked" })
  payslip(@Param("id") id: string) {
    return this.payroll.payslip(id);
  }

  @Get("payslips/:id/pdf")
  @Header("Content-Type", "application/pdf")
  @ApiOperation({ summary: "A printable payslip" })
  async payslipPdf(@Param("id") id: string, @Res() res: Response) {
    const payslip = await this.payroll.payslip(id);
    const pdf = await this.pdf.render(payslip);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="payslip-${payslip.id}.pdf"`);
    res.send(pdf);
  }
}
