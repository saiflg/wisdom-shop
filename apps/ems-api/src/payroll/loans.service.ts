import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import {
  checkRepayment,
  deductionThisMonth,
  monthsRemaining,
  outstandingCents,
  summariseRegister,
  type RegisterRow,
  type StaffLoanKind,
  type StaffLoanStatus,
} from "./loan-math";

export interface CreateLoanInput {
  staffProfileId: string;
  kind?: StaffLoanKind;
  reference?: string;
  principalCents: number;
  monthlyDeductionCents?: number;
  issuedOn?: Date;
  note?: string;
}

@Injectable()
export class LoansService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(input: CreateLoanInput) {
    const client = await this.tenantPrisma.getClient();

    if (!Number.isInteger(input.principalCents) || input.principalCents <= 0) {
      throw new BadRequestException("The amount lent must be a positive whole number");
    }
    if (input.monthlyDeductionCents !== undefined && input.monthlyDeductionCents < 0) {
      throw new BadRequestException("The monthly deduction cannot be negative");
    }

    const staff = await client.staffProfile.findUnique({
      where: { id: input.staffProfileId },
      select: { id: true, deletedAt: true },
    });
    if (!staff || staff.deletedAt) throw new NotFoundException("No staff member found with that id");

    const reference = input.reference?.trim() || (await this.nextReference());

    try {
      return await client.staffLoan.create({
        data: {
          staffProfileId: input.staffProfileId,
          kind: input.kind ?? "LOAN",
          reference,
          principalCents: input.principalCents,
          monthlyDeductionCents: input.monthlyDeductionCents ?? 0,
          issuedOn: input.issuedOn ?? new Date(),
          note: input.note,
        },
      });
    } catch (error) {
      // The unique reference is what stops two clerks recording the same
      // agreement twice and creating two debts against one person.
      if ((error as { code?: string }).code === "P2002") {
        throw new ConflictException(`A loan with reference ${reference} already exists`);
      }
      throw error;
    }
  }

  /**
   * LN-2026-0007. Sequential within the year so a bursar can quote it aloud.
   *
   * Counting rather than keeping a counter means two clerks creating a loan in
   * the same second can compute the same reference — which is exactly what the
   * unique index on `reference` is there to catch, turning a silent collision
   * into a visible conflict the caller can retry.
   */
  private async nextReference(): Promise<string> {
    const client = await this.tenantPrisma.getClient();
    const year = new Date().getFullYear();
    const soFar = await client.staffLoan.count({ where: { reference: { startsWith: `LN-${year}-` } } });
    return `LN-${year}-${String(soFar + 1).padStart(4, "0")}`;
  }

  async list(options: { staffProfileId?: string; includeSettled?: boolean } = {}) {
    const client = await this.tenantPrisma.getClient();

    const loans = await client.staffLoan.findMany({
      where: {
        ...(options.staffProfileId ? { staffProfileId: options.staffProfileId } : {}),
        // Settled loans are hidden by default because a register is a list of
        // what is still owed, but never deleted: "did I ever repay that?" is
        // exactly the question this table exists to answer.
        ...(options.includeSettled ? {} : { status: { in: ["ACTIVE", "WRITTEN_OFF"] } }),
      },
      orderBy: [{ status: "asc" }, { issuedOn: "desc" }],
      include: {
        staffProfile: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    const rows: RegisterRow[] = loans.map((loan) => ({
      loanId: loan.id,
      staffName: `${loan.staffProfile.user.firstName} ${loan.staffProfile.user.lastName}`,
      kind: loan.kind as StaffLoanKind,
      reference: loan.reference,
      issuedOn: loan.issuedOn,
      principalCents: loan.principalCents,
      repaidCents: loan.repaidCents,
      outstandingCents: outstandingCents(loan),
      monthlyDeductionCents: loan.monthlyDeductionCents,
      status: loan.status as StaffLoanStatus,
    }));

    return {
      rows: rows.map((row) => ({
        ...row,
        monthsRemaining: monthsRemaining({
          principalCents: row.principalCents,
          repaidCents: row.repaidCents,
          monthlyDeductionCents: row.monthlyDeductionCents,
          status: row.status,
        }),
      })),
      totals: summariseRegister(rows),
    };
  }

  async get(loanId: string) {
    const client = await this.tenantPrisma.getClient();
    const loan = await client.staffLoan.findUnique({
      where: { id: loanId },
      include: {
        staffProfile: { select: { user: { select: { firstName: true, lastName: true } } } },
        repayments: { orderBy: { paidOn: "desc" } },
      },
    });
    if (!loan) throw new NotFoundException("No loan found with that id");

    return {
      ...loan,
      staffName: `${loan.staffProfile.user.firstName} ${loan.staffProfile.user.lastName}`,
      outstandingCents: outstandingCents(loan),
      monthsRemaining: monthsRemaining(loan as never),
    };
  }

  /**
   * Record one repayment.
   *
   * `runId` makes it idempotent: the database refuses a second repayment
   * against the same loan and payroll run, so re-running payroll cannot
   * deduct the same instalment twice. A duplicate is treated as success —
   * the desired state already holds, and an error would make a harmless
   * re-run look like a failure.
   */
  async repay(loanId: string, input: { amountCents: number; runId?: string; note?: string; paidOn?: Date }) {
    const client = await this.tenantPrisma.getClient();

    const loan = await client.staffLoan.findUnique({ where: { id: loanId } });
    if (!loan) throw new NotFoundException("No loan found with that id");

    const check = checkRepayment(loan as never, input.amountCents);
    if (!check.ok) throw new BadRequestException(check.reason);

    try {
      // One transaction: a repayment recorded without the balance moving, or
      // the reverse, is a discrepancy nobody can explain a year later.
      return await client.$transaction(async (tx) => {
        await tx.staffLoanRepayment.create({
          data: {
            loanId,
            runId: input.runId ?? null,
            amountCents: check.amountCents,
            paidOn: input.paidOn ?? new Date(),
            note: input.note,
          },
        });

        const repaidCents = loan.repaidCents + check.amountCents;
        return tx.staffLoan.update({
          where: { id: loanId },
          data: {
            repaidCents,
            // Settled the moment nothing is left, rather than waiting for
            // somebody to notice and change it by hand.
            status: repaidCents >= loan.principalCents ? "SETTLED" : loan.status,
          },
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        return client.staffLoan.findUniqueOrThrow({ where: { id: loanId } });
      }
      throw error;
    }
  }

  /**
   * What payroll should deduct from each person this month.
   *
   * Returned rather than applied, so the payroll run decides when to commit —
   * and so this can be shown as a preview before anybody is paid.
   */
  async dueForPayroll() {
    const client = await this.tenantPrisma.getClient();

    const loans = await client.staffLoan.findMany({
      where: { status: "ACTIVE" },
      include: { staffProfile: { select: { id: true, user: { select: { firstName: true, lastName: true } } } } },
    });

    return loans
      .map((loan) => ({
        loanId: loan.id,
        staffProfileId: loan.staffProfileId,
        staffName: `${loan.staffProfile.user.firstName} ${loan.staffProfile.user.lastName}`,
        reference: loan.reference,
        amountCents: deductionThisMonth(loan as never),
      }))
      .filter((row) => row.amountCents > 0);
  }

  /**
   * Forgive the remaining balance, or cancel a loan recorded in error.
   *
   * Separate from repayment because they are different facts: a written-off
   * loan was never paid back, and recording forgiveness as a repayment would
   * make the school's books say it recovered money it did not.
   */
  async close(loanId: string, status: "WRITTEN_OFF" | "CANCELLED", note?: string) {
    const client = await this.tenantPrisma.getClient();
    const loan = await client.staffLoan.findUnique({ where: { id: loanId } });
    if (!loan) throw new NotFoundException("No loan found with that id");
    if (loan.status === "SETTLED") {
      throw new BadRequestException("This loan is already repaid in full");
    }

    return client.staffLoan.update({
      where: { id: loanId },
      data: { status, note: note ?? loan.note },
    });
  }
}
