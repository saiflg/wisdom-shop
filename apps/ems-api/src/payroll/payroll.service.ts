import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { TenantSecretsService } from "@/common/crypto/tenant-secrets.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { maskAccountNumber } from "@/staff/bank-details";
import {
  computePayslip,
  formatPayPeriod,
  isOverDeducted,
  summarisePayroll,
  type PayslipLine,
  type SalaryComponentInput,
} from "./payroll-math";
import type { SetSalaryComponentsDto } from "./dto/set-salary-components.dto";
import type { CreatePayrollRunDto } from "./dto/create-payroll-run.dto";

@Injectable()
export class PayrollService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly secrets: TenantSecretsService,
  ) {}

  // ── Salary components ──────────────────────────────────────────────────

  /**
   * Keyed by user id, like every other staff route.
   *
   * The staff profile is an implementation detail of how employment records
   * are stored; making callers know both ids would be a leak of that.
   */
  private async requireStaffProfile(userId: string) {
    const client = await this.tenantPrisma.getClient();

    const user = await client.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { staffProfile: true },
    });
    if (!user) throw new NotFoundException("No staff member found with that id");

    if (!user.staffProfile || user.staffProfile.deletedAt) {
      // A salary belongs to an employment record, so this is the right
      // refusal — but "not found" alone would send an administrator hunting
      // for a person who is plainly on the screen in front of them.
      throw new NotFoundException(
        `${user.firstName} ${user.lastName} has no employment record yet. Add their staff details before setting a salary.`,
      );
    }
    return { profile: user.staffProfile, name: `${user.firstName} ${user.lastName}` };
  }

  async getComponents(userId: string) {
    const client = await this.tenantPrisma.getClient();
    const { profile, name } = await this.requireStaffProfile(userId);

    const components = await client.salaryComponent.findMany({
      where: { staffProfileId: profile.id, deletedAt: null },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    });

    return {
      userId,
      staffProfileId: profile.id,
      staffName: name,
      components,
      // Shown alongside so an administrator sees the consequence of what they
      // just typed without having to run a payroll to find out.
      preview: computePayslip(components as SalaryComponentInput[]),
    };
  }

  /**
   * Replaces a staff member's salary wholesale.
   *
   * Replace rather than patch: a salary is a set of lines that must be
   * consistent with each other, and "add a line" invites a state where two
   * components both claim to be basic.
   */
  async setComponents(userId: string, dto: SetSalaryComponentsDto) {
    const client = await this.tenantPrisma.getClient();
    const { profile } = await this.requireStaffProfile(userId);
    const staffProfileId = profile.id;

    const basics = dto.components.filter((component) => component.isBasic && component.kind === "EARNING");
    if (basics.length > 1) {
      throw new BadRequestException("Only one component can be the basic pay that percentages are taken from");
    }
    if (dto.components.some((c) => c.basis === "PERCENT_OF_BASIC" && c.isBasic)) {
      throw new BadRequestException("Basic pay must be a fixed amount, not a percentage");
    }
    // Fails here rather than at payroll time, where it would surprise
    // somebody mid-run.
    computePayslip(dto.components as SalaryComponentInput[]);

    await client.$transaction([
      client.salaryComponent.deleteMany({ where: { staffProfileId } }),
      client.salaryComponent.createMany({
        data: dto.components.map((component) => ({
          staffProfileId,
          label: component.label.trim(),
          kind: component.kind,
          basis: component.basis ?? "FIXED",
          amount: component.amount,
          isBasic: component.isBasic ?? false,
        })),
      }),
    ]);

    return this.getComponents(userId);
  }

  // ── Runs ───────────────────────────────────────────────────────────────

  async listRuns() {
    const client = await this.tenantPrisma.getClient();

    const runs = await client.payrollRun.findMany({
      include: { payslips: { select: { grossCents: true, deductionsCents: true, netCents: true } } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    return runs.map(({ payslips, ...run }) => ({
      ...run,
      period: formatPayPeriod(run.year, run.month),
      summary: summarisePayroll(payslips),
    }));
  }

  /**
   * Opens a month's payroll and drafts a payslip for every staff member.
   *
   * The unique index on (year, month) is what makes this safe to press twice:
   * the second attempt collides rather than producing a second month's worth
   * of pay. Caught and turned into a plain 409 rather than a Prisma error.
   */
  async createRun(dto: CreatePayrollRunDto) {
    const client = await this.tenantPrisma.getClient();

    let run;
    try {
      run = await client.payrollRun.create({
        data: { year: dto.year, month: dto.month, notes: dto.notes?.trim() || null },
      });
    } catch (error) {
      if ((error as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
        throw new ConflictException(
          `${formatPayPeriod(dto.year, dto.month)} has already been run. Open it rather than starting it again.`,
        );
      }
      throw error;
    }

    await this.draftPayslips(run.id);
    return this.getRun(run.id);
  }

  async getRun(id: string) {
    const client = await this.tenantPrisma.getClient();

    const run = await client.payrollRun.findFirst({
      where: { id },
      include: { payslips: { orderBy: { staffName: "asc" } } },
    });
    if (!run) throw new NotFoundException("No payroll run found with that id");

    return {
      ...run,
      period: formatPayPeriod(run.year, run.month),
      summary: summarisePayroll(run.payslips),
      payslips: run.payslips.map((payslip) => ({
        ...payslip,
        overDeducted: isOverDeducted({
          lines: [],
          grossCents: payslip.grossCents,
          deductionsCents: payslip.deductionsCents,
          netCents: payslip.netCents,
        }),
      })),
    };
  }

  /** Recomputes a draft from current salaries. Refused once approved. */
  async refreshRun(id: string) {
    const run = await this.requireRun(id);
    if (run.status !== "DRAFT") {
      throw new BadRequestException("This payroll has been approved. Its payslips no longer change.");
    }

    await this.draftPayslips(id);
    return this.getRun(id);
  }

  /**
   * Freezes the run.
   *
   * After this the payslips are a record of what was paid, not a view of what
   * the salaries currently say — the same reasoning as publishing a term
   * result. A pay rise next month must not rewrite this month.
   */
  async approve(id: string, viewer: AuthenticatedUser) {
    const run = await this.requireRun(id);
    if (run.status === "PAID") throw new BadRequestException("This payroll has already been paid");
    if (run.status === "APPROVED") return this.getRun(id);

    const client = await this.tenantPrisma.getClient();
    const count = await client.payslip.count({ where: { runId: id } });
    if (count === 0) {
      throw new BadRequestException("There are no payslips to approve. Add salaries for your staff first.");
    }

    await client.payrollRun.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedByUserId: viewer.id,
        approvedByName: await this.nameOf(viewer),
      },
    });

    return this.getRun(id);
  }

  /**
   * Records that the bank has been instructed.
   *
   * Recorded, never performed: this software does not move money, in exactly
   * the same way it does not charge a card. Somebody took the transfer file
   * to a bank, and this is them saying so.
   */
  async markPaid(id: string, viewer: AuthenticatedUser) {
    const run = await this.requireRun(id);
    if (run.status === "DRAFT") {
      throw new BadRequestException("Approve this payroll before recording it as paid");
    }
    if (run.status === "PAID") return this.getRun(id);

    const client = await this.tenantPrisma.getClient();
    await client.payrollRun.update({
      where: { id },
      data: { status: "PAID", paidAt: new Date(), paidByUserId: viewer.id, paidByName: await this.nameOf(viewer) },
    });

    return this.getRun(id);
  }

  /**
   * The file a bursar takes to the bank.
   *
   * The one place full account numbers legitimately leave the database, so
   * every one of them is logged first — the same order as the staff reveal
   * route, and for the same reason: an unlogged disclosure is worse than a
   * failed download, because only one of the two is recoverable.
   *
   * Staff with no account number on file are returned as `missing` rather
   * than quietly omitted. Somebody not being paid is exactly the thing a
   * silent filter would hide until payday.
   */
  async transferFile(id: string, viewer: AuthenticatedUser) {
    const run = await this.requireRun(id);
    if (run.status === "DRAFT") {
      throw new BadRequestException("Approve this payroll before downloading the bank file");
    }

    const client = await this.tenantPrisma.getClient();
    const payslips = await client.payslip.findMany({
      where: { runId: id },
      include: { staffProfile: true },
      orderBy: { staffName: "asc" },
    });

    const actorName = await this.nameOf(viewer);
    const rows: Array<{ staffName: string; bankName: string; bankCode: string; accountName: string; accountNumber: string; netCents: number }> = [];
    const missing: string[] = [];

    for (const payslip of payslips) {
      const accountNumber = this.secrets.tryDecrypt(payslip.staffProfile.accountNumberEncrypted);
      if (!accountNumber) {
        missing.push(payslip.staffName);
        continue;
      }

      await client.bankDetailAccess.create({
        data: {
          staffProfileId: payslip.staffProfileId,
          staffName: payslip.staffName,
          actorUserId: viewer.id,
          actorName,
          reason: `payroll run ${formatPayPeriod(run.year, run.month)}`,
        },
      });

      rows.push({
        staffName: payslip.staffName,
        bankName: payslip.staffProfile.bankName ?? "",
        bankCode: payslip.staffProfile.bankCode ?? "",
        accountName: payslip.staffProfile.accountName ?? payslip.staffName,
        accountNumber,
        netCents: payslip.netCents,
      });
    }

    const header = "Staff name,Bank,Bank code,Account name,Account number,Amount";
    const body = rows
      .map((row) =>
        [
          csvCell(row.staffName),
          csvCell(row.bankName),
          csvCell(row.bankCode),
          csvCell(row.accountName),
          // Quoted so a leading zero survives the spreadsheet a bank clerk
          // will inevitably open this in.
          `"${row.accountNumber}"`,
          (row.netCents / 100).toFixed(2),
        ].join(","),
      )
      .join("\n");

    return {
      filename: `payroll-${run.year}-${String(run.month).padStart(2, "0")}.csv`,
      csv: `${header}\n${body}\n`,
      paidCount: rows.length,
      missing,
    };
  }

  async payslip(id: string) {
    const client = await this.tenantPrisma.getClient();

    const payslip = await client.payslip.findFirst({
      where: { id },
      include: { run: true, staffProfile: true },
    });
    if (!payslip) throw new NotFoundException("No payslip found with that id");

    return {
      ...payslip,
      period: formatPayPeriod(payslip.run.year, payslip.run.month),
      // Masked: a payslip is a document that gets printed and left on desks.
      accountNumberMasked: maskAccountNumber(
        this.secrets.tryDecrypt(payslip.staffProfile.accountNumberEncrypted),
      ),
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────

  /** Draws up a payslip for every current staff member from their salary today. */
  private async draftPayslips(runId: string) {
    const client = await this.tenantPrisma.getClient();

    const staff = await client.staffProfile.findMany({
      where: { deletedAt: null },
      include: {
        user: { select: { firstName: true, lastName: true } },
        salaryComponents: { where: { deletedAt: null } },
      },
    });

    await client.payslip.deleteMany({ where: { runId } });

    for (const member of staff) {
      // Nobody on zero pay gets a payslip: an empty one is noise on a run a
      // bursar has to read.
      if (member.salaryComponents.length === 0) continue;

      const totals = computePayslip(member.salaryComponents as SalaryComponentInput[]);
      await client.payslip.create({
        data: {
          runId,
          staffProfileId: member.id,
          staffName: `${member.user.firstName} ${member.user.lastName}`,
          staffNumber: member.staffNumber,
          grossCents: totals.grossCents,
          deductionsCents: totals.deductionsCents,
          netCents: totals.netCents,
          lines: totals.lines as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  private async requireRun(id: string) {
    const client = await this.tenantPrisma.getClient();
    const run = await client.payrollRun.findFirst({ where: { id } });
    if (!run) throw new NotFoundException("No payroll run found with that id");
    return run;
  }

  private async nameOf(viewer: AuthenticatedUser): Promise<string> {
    const client = await this.tenantPrisma.getClient();
    const user = await client.user.findUnique({
      where: { id: viewer.id },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}` : viewer.id;
  }
}

/** Quotes a CSV cell, doubling any quotes inside it. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export type { PayslipLine };
