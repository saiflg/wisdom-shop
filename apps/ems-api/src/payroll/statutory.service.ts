import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import {
  buildPensionRegister,
  buildTaxRegister,
  payeHeading,
  pensionHeading,
  pensionRemittanceLines,
  type PensionRegister,
  type PensionSettingsLike,
  type RegisterPayslip,
  type TaxRegister,
} from "./statutory-registers";

export interface PensionSettingsInput {
  providerName?: string | null;
  remittanceBankName?: string | null;
  remittanceAccountNumber?: string | null;
  employerMatchPercent?: number;
  componentLabel?: string;
}

@Injectable()
export class StatutoryService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * The payslips a register is built from.
   *
   * Read from the snapshot on each payslip rather than from current salary
   * components: a schedule for July must still say what July said after
   * somebody's pension contribution changes in August.
   */
  private async payslipsFor(runId: string): Promise<{ run: { year: number; month: number }; payslips: RegisterPayslip[] }> {
    const client = await this.tenantPrisma.getClient();

    const run = await client.payrollRun.findUnique({
      where: { id: runId },
      select: { id: true, year: true, month: true },
    });
    if (!run) throw new NotFoundException("No payroll run found with that id");

    const rows = await client.payslip.findMany({
      where: { runId },
      orderBy: { staffName: "asc" },
      select: {
        staffProfileId: true,
        staffName: true,
        lines: true,
        staffProfile: { select: { pensionPin: true } },
      },
    });

    return {
      run,
      payslips: rows.map((row) => ({
        staffProfileId: row.staffProfileId,
        staffName: row.staffName,
        pensionPin: row.staffProfile?.pensionPin ?? null,
        lines: Array.isArray(row.lines) ? (row.lines as RegisterPayslip["lines"]) : [],
      })),
    };
  }

  private async schoolName(): Promise<string> {
    const client = await this.tenantPrisma.getClient();
    const branding = await client.brandingSettings.findFirst({ select: { displayName: true } });
    return branding?.displayName?.trim() || "School";
  }

  /** PAYE for one month: who paid, how much, and the total to remit. */
  async taxRegister(runId: string): Promise<{
    schoolName: string;
    heading: string;
    register: TaxRegister;
  }> {
    const { run, payslips } = await this.payslipsFor(runId);
    return {
      schoolName: await this.schoolName(),
      heading: payeHeading(run.year, run.month),
      register: buildTaxRegister(payslips),
    };
  }

  /** The contribution schedule filed with the pension administrator. */
  async pensionRegister(runId: string): Promise<{
    schoolName: string;
    heading: string;
    remittance: string[];
    settings: PensionSettingsLike;
    register: PensionRegister;
  }> {
    const { run, payslips } = await this.payslipsFor(runId);
    const settings = await this.getPensionSettings();

    return {
      schoolName: await this.schoolName(),
      heading: pensionHeading(run.year, run.month),
      remittance: pensionRemittanceLines(settings),
      settings,
      register: buildPensionRegister(payslips, settings, settings.componentLabel),
    };
  }

  /**
   * Read-repair, like the voucher layout: a school with no row gets working
   * defaults rather than needing a backfill, and acquires no row it did not
   * ask for.
   */
  async getPensionSettings(): Promise<PensionSettingsLike & { componentLabel: string }> {
    const client = await this.tenantPrisma.getClient();
    const row = await client.pensionSettings.findFirst();

    return {
      providerName: row?.providerName ?? null,
      remittanceBankName: row?.remittanceBankName ?? null,
      remittanceAccountNumber: row?.remittanceAccountNumber ?? null,
      // Clamped rather than trusted: a negative share would credit the
      // employer money, and a wild one would over-remit by orders of
      // magnitude on a schedule nobody re-reads.
      employerMatchPercent: Math.min(1000, Math.max(0, row?.employerMatchPercent ?? 100)),
      componentLabel: row?.componentLabel?.trim() || "Pension",
    };
  }

  async savePensionSettings(input: PensionSettingsInput) {
    const client = await this.tenantPrisma.getClient();

    const data = {
      providerName: input.providerName?.trim() || null,
      remittanceBankName: input.remittanceBankName?.trim() || null,
      remittanceAccountNumber: input.remittanceAccountNumber?.trim() || null,
      employerMatchPercent: Math.min(1000, Math.max(0, Math.trunc(input.employerMatchPercent ?? 100))),
      componentLabel: input.componentLabel?.trim() || "Pension",
    };

    const existing = await client.pensionSettings.findFirst({ select: { id: true } });
    if (existing) {
      await client.pensionSettings.update({ where: { id: existing.id }, data });
    } else {
      await client.pensionSettings.create({ data });
    }

    return this.getPensionSettings();
  }
}
