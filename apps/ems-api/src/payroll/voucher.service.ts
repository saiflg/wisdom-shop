import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "ems-tenant-client";
import ExcelJS from "exceljs";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { TenantSecretsService } from "@/common/crypto/tenant-secrets.service";
import { formatPayPeriod } from "./payroll-math";
import {
  buildVoucher,
  formatCents,
  type Voucher,
  type VoucherColumn,
  type VoucherPayslip,
} from "./voucher-layout";
import { parseRowsPerPage, parseVoucherColumns, validateColumns } from "./voucher-settings";

/** What the school prints above the table. */
export interface VoucherHeading {
  schoolName: string;
  title: string;
  period: string;
}

@Injectable()
export class VoucherService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly secrets: TenantSecretsService,
  ) {}

  /**
   * Gather one payroll run into voucher rows.
   *
   * Reads the payslip snapshots rather than recomputing from current salary
   * components: the voucher for July must still print July's figures after
   * somebody's pay changes in August. That is the same reason the payslip
   * stores its lines by value.
   */
  async gather(
    runId: string,
    revealAccountNumbers: boolean,
    viewer?: { id: string },
  ): Promise<VoucherPayslip[]> {
    const client = await this.tenantPrisma.getClient();

    // Revealing is only possible with somebody to hold responsible. Enforced
    // here rather than in the controller so no future caller can quietly
    // obtain fifty account numbers without leaving a trace.
    if (revealAccountNumbers && !viewer) {
      throw new NotFoundException("An account-number disclosure needs a named viewer");
    }

    const payslips = await client.payslip.findMany({
      where: { runId },
      orderBy: { staffName: "asc" },
      include: {
        staffProfile: {
          select: {
            id: true,
            jobTitle: true,
            qualification: true,
            remark: true,
            startDate: true,
            bankName: true,
            accountNumberEncrypted: true,
          },
        },
      },
    });

    if (revealAccountNumbers && viewer) {
      const run = await client.payrollRun.findUnique({ where: { id: runId } });
      const actor = await client.user.findUnique({
        where: { id: viewer.id },
        select: { firstName: true, lastName: true },
      });
      const actorName = actor ? `${actor.firstName} ${actor.lastName}` : viewer.id;
      const reason = run
        ? `salary voucher ${formatPayPeriod(run.year, run.month)}`
        : "salary voucher";

      // One row per person, exactly as the bank transfer file does. A single
      // "downloaded the voucher" entry would not answer the question the log
      // exists for: whose account number did this person see.
      await client.bankDetailAccess.createMany({
        data: payslips
          .filter((p) => p.staffProfile?.accountNumberEncrypted)
          .map((p) => ({
            staffProfileId: p.staffProfileId,
            staffName: p.staffName,
            actorUserId: viewer.id,
            actorName,
            reason,
          })),
      });
    }

    return payslips.map((payslip): VoucherPayslip => {
      const profile = payslip.staffProfile;

      // Decryption happens here and only when explicitly asked for. A voucher
      // that goes to the bank needs real account numbers; one pinned to a
      // noticeboard must not carry fifty of them.
      let accountNumber: string | null = null;
      if (profile?.accountNumberEncrypted) {
        const full = this.secrets.tryDecrypt(profile.accountNumberEncrypted);
        if (full) {
          accountNumber = revealAccountNumbers ? full : `••••${full.slice(-4)}`;
        }
      }

      return {
        staffProfileId: payslip.staffProfileId,
        staffName: payslip.staffName,
        staffNumber: payslip.staffNumber,
        bankName: profile?.bankName ?? null,
        accountNumber,
        jobTitle: profile?.jobTitle ?? null,
        qualification: profile?.qualification ?? null,
        remark: profile?.remark ?? null,
        startDate: profile?.startDate
          ? profile.startDate.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : null,
        grossCents: payslip.grossCents,
        deductionsCents: payslip.deductionsCents,
        netCents: payslip.netCents,
        lines: Array.isArray(payslip.lines)
          ? (payslip.lines as VoucherPayslip["lines"])
          : [],
      };
    });
  }

  async build(
    runId: string,
    options: {
      revealAccountNumbers?: boolean;
      viewer?: { id: string };
      rowsPerPage?: number;
      columns?: VoucherColumn[];
    } = {},
  ): Promise<{ heading: VoucherHeading; columns: VoucherColumn[]; voucher: Voucher }> {
    const client = await this.tenantPrisma.getClient();

    const run = await client.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException("No payroll run found with that id");

    const payslips = await this.gather(runId, options.revealAccountNumbers ?? false, options.viewer);
    const settings = await this.getSettings();
    const columns = options.columns ?? settings.columns;

    // Branding is optional and its displayName is what the school calls
    // itself. A school that never set one still gets a voucher — with a
    // neutral heading rather than a machine identifier printed on a document
    // people sign.
    const branding = await client.brandingSettings.findFirst({ select: { displayName: true } });

    return {
      heading: {
        schoolName: branding?.displayName?.trim() || "School",
        title: settings.title,
        period: `${formatPayPeriod(run.year, run.month).toUpperCase()} SALARIES AND ALLOWANCES`,
      },
      columns,
      voucher: buildVoucher(payslips, columns, options.rowsPerPage ?? settings.rowsPerPage),
    };
  }

  /**
   * This school's voucher layout.
   *
   * Read-repair rather than seed-at-provisioning: a school created before
   * this feature existed has no row, and every school would otherwise need a
   * backfill. The defaults are returned unsaved, so a school that never opens
   * the editor still gets a working voucher and no row it did not ask for.
   */
  async getSettings(): Promise<{ title: string; rowsPerPage: number; columns: VoucherColumn[] }> {
    const client = await this.tenantPrisma.getClient();
    const row = await client.voucherSettings.findFirst();

    return {
      title: row?.title?.trim() || "GENERAL VOUCHER",
      rowsPerPage: parseRowsPerPage(row?.rowsPerPage),
      columns: parseVoucherColumns(row?.columns),
    };
  }

  /**
   * Replace the layout wholesale.
   *
   * Not a patch: the columns are an ordered sequence, and merging a partial
   * update into an order is how an editor and a server end up disagreeing
   * about which column comes third.
   */
  async saveSettings(input: { title?: string; rowsPerPage?: number; columns: VoucherColumn[] }) {
    const client = await this.tenantPrisma.getClient();

    const columns = parseVoucherColumns(input.columns);
    const problems = validateColumns(columns);
    if (problems.length > 0) {
      throw new BadRequestException(problems);
    }

    const data = {
      title: input.title?.trim() || "GENERAL VOUCHER",
      rowsPerPage: parseRowsPerPage(input.rowsPerPage ?? 16),
      columns: columns as unknown as Prisma.InputJsonValue,
    };

    const existing = await client.voucherSettings.findFirst({ select: { id: true } });
    const saved = existing
      ? await client.voucherSettings.update({ where: { id: existing.id }, data })
      : await client.voucherSettings.create({ data });

    return {
      title: saved.title,
      rowsPerPage: saved.rowsPerPage,
      columns: parseVoucherColumns(saved.columns),
    };
  }

  /**
   * The voucher as a spreadsheet.
   *
   * xlsx rather than PDF for this one because a bursar's next move is usually
   * to sort it, filter it or hand it to a bank — which a PDF makes hostile.
   * The PDF exists separately for signing.
   */
  async toWorkbook(
    runId: string,
    options: { revealAccountNumbers?: boolean; viewer?: { id: string }; rowsPerPage?: number } = {},
  ) {
    const { heading, columns, voucher } = await this.build(runId, options);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Wisdom Campus";
    const ws = wb.addWorksheet("SALARY VOUCHER", {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const width = columns.length;
    const titleRows = [heading.schoolName, heading.period, heading.title];
    titleRows.forEach((text, i) => {
      const row = ws.addRow([text]);
      ws.mergeCells(i + 1, 1, i + 1, width);
      row.getCell(1).alignment = { horizontal: "center" };
      row.getCell(1).font = { bold: true, size: i === 0 ? 14 : 11 };
    });

    const header = ws.addRow(columns.map((c) => c.label));
    header.font = { bold: true };
    header.alignment = { horizontal: "center", wrapText: true };

    for (const page of voucher.pages) {
      for (const row of page.rows) {
        const added = ws.addRow(
          row.cells.map((cell, i) => {
            // Blank, not zero, where the layout decided blank. A column of
            // zeroes hides the handful of rows that actually carry a
            // deduction, and the screen and the download must not disagree
            // about the same voucher.
            if (cell.text === "") return null;
            // Numbers as numbers, so the bursar can sum a column in Excel.
            // Text that merely looks numeric — an account number with a
            // leading zero — must stay text or Excel eats the zero.
            return columns[i].money && cell.cents !== null ? cell.cents / 100 : cell.text;
          }),
        );
        added.eachCell((cell, col) => {
          if (columns[col - 1]?.money) cell.numFmt = "#,##0.00";
        });
      }
    }

    const totals = ws.addRow(
      voucher.columnTotals.map((total, i) => {
        if (i === 0) return "TOTAL";
        // A column nobody used totals to zero; printing "0.00" across eight
        // unused columns makes the line that matters harder to find.
        if (total === null || total === 0) return null;
        return total / 100;
      }),
    );
    totals.font = { bold: true };
    totals.eachCell((cell, col) => {
      if (columns[col - 1]?.money) cell.numFmt = "#,##0.00";
    });

    ws.columns.forEach((column, i) => {
      column.width = columns[i]?.money ? 14 : Math.max(10, columns[i]?.label.length + 4);
    });

    // Freeze the headings so a fifty-row voucher stays readable when scrolled.
    ws.views = [{ state: "frozen", ySplit: 4 }];

    return {
      buffer: Buffer.from(await wb.xlsx.writeBuffer()),
      filename: `voucher-${heading.period.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx`,
      grandTotal: formatCents(voucher.grandTotalCents),
      staffCount: voucher.staffCount,
    };
  }
}
