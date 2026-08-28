import { Injectable } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { buildStatement } from "./accounting-rules";

@Injectable()
export class AccountingService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * What money did over a period.
   *
   * Every figure comes from a record somebody made deliberately — a payment
   * received, an expense marked paid, a payroll run marked paid. Nothing is
   * inferred, and nothing is estimated.
   *
   * Payroll is counted from payslips belonging to runs that were marked PAID,
   * using the NET figure. Gross would double-count the deductions, which are
   * money the school still holds or has passed to somebody else, and would
   * overstate what left the account by exactly the tax.
   */
  async statement(from: Date, to: Date) {
    const client = await this.tenantPrisma.getClient();
    const window = { gte: from, lte: to };

    const [fees, expenses, welfare, paidRuns, expensesUnpaid, welfareUnpaid, invoices] = await Promise.all([
      client.feePayment.aggregate({
        where: { receivedAt: window },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      client.expense.aggregate({
        where: { status: "PAID", paidAt: window, deletedAt: null },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      client.welfareRequest.aggregate({
        where: { status: "PAID", paidAt: window, deletedAt: null },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      client.payrollRun.findMany({
        where: { status: "PAID", paidAt: window },
        select: { id: true },
      }),
      client.expense.aggregate({
        where: { status: "APPROVED", deletedAt: null },
        _sum: { amountCents: true },
      }),
      client.welfareRequest.aggregate({
        where: { status: "APPROVED", deletedAt: null },
        _sum: { amountCents: true },
      }),
      client.feeInvoice.aggregate({ _sum: { totalCents: true, paidCents: true } }),
    ]);

    // Kept as two plain numbers rather than a stand-in aggregate object: a
    // fake result shape is a thing that compiles and then diverges from the
    // real one the first time Prisma changes it.
    let payrollNetCents = 0;
    let payslipCount = 0;
    if (paidRuns.length > 0) {
      const payroll = await client.payslip.aggregate({
        where: { runId: { in: paidRuns.map((run) => run.id) } },
        _sum: { netCents: true },
        _count: { _all: true },
      });
      payrollNetCents = payroll._sum.netCents ?? 0;
      payslipCount = payroll._count._all;
    }

    const invoiced = invoices._sum.totalCents ?? 0;
    const collected = invoices._sum.paidCents ?? 0;

    return buildStatement({
      from,
      to,
      feesReceived: { amountCents: fees._sum.amountCents ?? 0, count: fees._count._all },
      expensesPaid: { amountCents: expenses._sum.amountCents ?? 0, count: expenses._count._all },
      payrollPaid: { amountCents: payrollNetCents, count: payslipCount },
      welfarePaid: { amountCents: welfare._sum.amountCents ?? 0, count: welfare._count._all },
      expensesApprovedUnpaid: expensesUnpaid._sum.amountCents ?? 0,
      welfareApprovedUnpaid: welfareUnpaid._sum.amountCents ?? 0,
      // Across all time rather than the period: what a school is owed is not
      // a fact about a term, and reporting only this term's arrears would
      // make an old debt look settled.
      feesOutstanding: Math.max(0, invoiced - collected),
    });
  }
}
