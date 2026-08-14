import { Module } from "@nestjs/common";
import { TenantSecretsService } from "@/common/crypto/tenant-secrets.service";
import { PayrollController } from "./payroll.controller";
import { PayrollService } from "./payroll.service";
import { PayslipPdfService } from "./payslip-pdf.service";
import { VoucherService } from "./voucher.service";
import { StatutoryService } from "./statutory.service";
import { StaffFeesService } from "./staff-fees.service";
import { LoansService } from "./loans.service";

@Module({
  controllers: [PayrollController],
  providers: [
    PayrollService,
    PayslipPdfService,
    VoucherService,
    StatutoryService,
    StaffFeesService,
    LoansService,
    TenantSecretsService,
  ],
  exports: [PayrollService, VoucherService, StatutoryService, StaffFeesService, LoansService],
})
export class PayrollModule {}
