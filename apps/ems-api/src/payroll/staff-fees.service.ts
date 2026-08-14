import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import {
  checkCurrencies,
  payrollPaymentReference,
  planRecovery,
  type OutstandingInvoice,
  type RecoveryPlan,
} from "./staff-fee-recovery";

export interface StaffFeeRow {
  staffProfileId: string;
  staffUserId: string;
  staffName: string;
  monthlyCapCents: number;
  children: { studentProfileId: string; studentName: string }[];
  plan: RecoveryPlan;
  /** Present when this person cannot be recovered against, and why. */
  blocked: string | null;
}

@Injectable()
export class StaffFeesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * A staff member's children are the students they are a guardian of.
   *
   * Derived rather than recorded separately: a school already tells the system
   * who a child's guardians are, and asking it to say so a second time in a
   * payroll screen guarantees the two lists eventually disagree.
   */
  async preview(currency = "NGN"): Promise<StaffFeeRow[]> {
    const client = await this.tenantPrisma.getClient();

    const staff = await client.staffProfile.findMany({
      where: { deletedAt: null, childFeeDeductionCents: { gt: 0 } },
      select: {
        id: true,
        userId: true,
        childFeeDeductionCents: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (staff.length === 0) return [];

    const links = await client.guardianLink.findMany({
      where: {
        guardianUserId: { in: staff.map((s) => s.userId) },
        studentProfile: { deletedAt: null },
      },
      select: {
        guardianUserId: true,
        studentProfileId: true,
        studentProfile: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    const studentIds = [...new Set(links.map((l) => l.studentProfileId))];
    const invoices = studentIds.length
      ? await client.feeInvoice.findMany({
          // DRAFT and VOID are excluded on purpose: an invoice nobody has
          // issued is not a debt, and taking money against one from somebody's
          // wages would be indefensible.
          where: {
            studentProfileId: { in: studentIds },
            status: { in: ["ISSUED", "PARTIALLY_PAID"] },
          },
          select: {
            id: true,
            invoiceNumber: true,
            studentProfileId: true,
            totalCents: true,
            paidCents: true,
            currency: true,
            dueDate: true,
            issuedAt: true,
          },
        })
      : [];

    const rows: StaffFeeRow[] = [];

    for (const member of staff) {
      const mine = links.filter((l) => l.guardianUserId === member.userId);
      const children = mine.map((l) => ({
        studentProfileId: l.studentProfileId,
        studentName: `${l.studentProfile.user.firstName} ${l.studentProfile.user.lastName}`,
      }));
      const byId = new Map(children.map((c) => [c.studentProfileId, c.studentName]));

      const theirs: OutstandingInvoice[] = invoices
        .filter((invoice) => byId.has(invoice.studentProfileId))
        .map((invoice) => ({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          studentProfileId: invoice.studentProfileId,
          studentName: byId.get(invoice.studentProfileId) ?? "Unknown",
          outstandingCents: invoice.totalCents - invoice.paidCents,
          currency: invoice.currency,
          dueDate: invoice.dueDate,
          issuedAt: invoice.issuedAt,
        }));

      const currencyCheck = checkCurrencies(theirs, currency);
      const plan = currencyCheck.ok
        ? planRecovery(theirs, member.childFeeDeductionCents)
        : { totalCents: 0, allocations: [], remainingCents: 0, outstandingCents: 0 };

      rows.push({
        staffProfileId: member.id,
        staffUserId: member.userId,
        staffName: `${member.user.firstName} ${member.user.lastName}`,
        monthlyCapCents: member.childFeeDeductionCents,
        children,
        plan,
        blocked: currencyCheck.ok ? null : currencyCheck.reason,
      });
    }

    return rows.sort((a, b) => a.staffName.localeCompare(b.staffName));
  }

  /**
   * Credit each child's invoice for a run that has been paid.
   *
   * Idempotent by database constraint, not by bookkeeping: every payment
   * carries the reference `payroll:<runId>`, and fee_payments is unique on
   * (invoiceId, reference). Applying the same run twice is refused by Postgres
   * — the same guard the gateway webhooks rely on.
   */
  async apply(runId: string, viewer: { id: string }, currency = "NGN") {
    const client = await this.tenantPrisma.getClient();

    // Looked up rather than taken from the token: a payment record says who
    // took the money, and a JWT carries an id, not a name somebody can read
    // on a receipt years later.
    const actorUser = await client.user.findUnique({
      where: { id: viewer.id },
      select: { firstName: true, lastName: true },
    });
    const actor = {
      id: viewer.id,
      name: actorUser ? `${actorUser.firstName} ${actorUser.lastName}` : viewer.id,
    };

    const run = await client.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException("No payroll run found with that id");
    if (run.status === "DRAFT") {
      // Crediting a family from a payroll nobody has approved would settle a
      // bill with money that has not been agreed, let alone paid.
      throw new BadRequestException("Approve the payroll run before recovering fees against it");
    }

    const reference = payrollPaymentReference(runId);
    const rows = await this.preview(currency);

    let applied = 0;
    let skipped = 0;
    const credited: { staffName: string; studentName: string; invoiceNumber: string; amountCents: number }[] = [];

    for (const row of rows) {
      for (const allocation of row.plan.allocations) {
        try {
          await client.$transaction(async (tx) => {
            await tx.feePayment.create({
              data: {
                invoiceId: allocation.invoiceId,
                amountCents: allocation.amountCents,
                method: "OTHER",
                reference,
                note: `Recovered from ${row.staffName}'s salary`,
                recordedByUserId: actor.id,
                recordedByName: actor.name,
              },
            });

            // paidCents is maintained on the invoice so a balance never needs
            // the payment table summed at read time — the same reason the fees
            // module keeps it there.
            const invoice = await tx.feeInvoice.update({
              where: { id: allocation.invoiceId },
              data: { paidCents: { increment: allocation.amountCents } },
              select: { totalCents: true, paidCents: true },
            });

            if (invoice.paidCents >= invoice.totalCents) {
              await tx.feeInvoice.update({
                where: { id: allocation.invoiceId },
                data: { status: "PAID" },
              });
            } else {
              await tx.feeInvoice.update({
                where: { id: allocation.invoiceId },
                data: { status: "PARTIALLY_PAID" },
              });
            }
          });

          applied += allocation.amountCents;
          credited.push({
            staffName: row.staffName,
            studentName: allocation.studentName,
            invoiceNumber: allocation.invoiceNumber,
            amountCents: allocation.amountCents,
          });
        } catch (error) {
          // P2002 means this run already credited this invoice. That is the
          // guard working, not a failure, so the rest of the run continues.
          if ((error as { code?: string }).code === "P2002") {
            skipped += 1;
            continue;
          }
          throw error;
        }
      }
    }

    return { appliedCents: applied, credited, alreadyDone: skipped };
  }
}
