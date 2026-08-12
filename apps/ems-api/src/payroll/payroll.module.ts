import { Module } from "@nestjs/common";
import { TenantSecretsService } from "@/common/crypto/tenant-secrets.service";
import { PayrollController } from "./payroll.controller";
import { PayrollService } from "./payroll.service";
import { PayslipPdfService } from "./payslip-pdf.service";
import { VoucherService } from "./voucher.service";

@Module({
  controllers: [PayrollController],
  providers: [PayrollService, PayslipPdfService, VoucherService, TenantSecretsService],
  exports: [PayrollService, VoucherService],
})
export class PayrollModule {}
