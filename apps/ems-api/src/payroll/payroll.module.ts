import { Module } from "@nestjs/common";
import { TenantSecretsService } from "@/common/crypto/tenant-secrets.service";
import { PayrollController } from "./payroll.controller";
import { PayrollService } from "./payroll.service";
import { PayslipPdfService } from "./payslip-pdf.service";

@Module({
  controllers: [PayrollController],
  providers: [PayrollService, PayslipPdfService, TenantSecretsService],
  exports: [PayrollService],
})
export class PayrollModule {}
