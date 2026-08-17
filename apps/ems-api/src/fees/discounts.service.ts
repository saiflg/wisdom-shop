import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { deriveInvoiceStatus } from "./fees-math";
import {
  applyDiscount,
  describeAward,
  describeDiscount,
  discountProblem,
  removeDiscount,
  scholarshipApplies,
  type DiscountKind,
} from "./fee-discounts";

interface GrantDiscountInput {
  label: string;
  kind: DiscountKind;
  value: number;
  reason?: string;
}

interface AwardInput {
  studentProfileId: string;
  name: string;
  sponsor?: string;
  kind: DiscountKind;
  value: number;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class DiscountsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private async actorName(userId: string): Promise<string | null> {
    const client = await this.tenantPrisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}` : null;
  }

  /**
   * Take money off one invoice.
   *
   * The invoice's payable total and its running discount move together, in
   * one transaction with the row that explains them — an invoice whose total
   * dropped with nothing saying why is the thing a bursar cannot defend.
   */
  async grant(invoiceId: string, input: GrantDiscountInput, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const invoice = await client.feeInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException("No invoice found with that id");

    const problem = discountProblem(invoice, { kind: input.kind, value: input.value });
    if (problem) throw new BadRequestException(problem);

    const outcome = applyDiscount(invoice, { kind: input.kind, value: input.value });
    const grantedByName = await this.actorName(viewer.id);

    await client.$transaction([
      client.feeDiscount.create({
        data: {
          invoiceId,
          label: input.label.trim(),
          kind: input.kind,
          value: input.value,
          amountCents: outcome.appliedCents,
          reason: input.reason?.trim() || null,
          grantedByUserId: viewer.id,
          grantedByName,
        },
      }),
      client.feeInvoice.update({
        where: { id: invoiceId },
        data: {
          totalCents: outcome.totalCents,
          discountCents: outcome.discountCents,
          // A discount can settle an invoice outright, and the status has to
          // follow or the family keeps being chased for nothing.
          status: deriveInvoiceStatus(outcome.totalCents, invoice.paidCents, invoice.status),
        },
      }),
    ]);

    return this.forInvoice(invoiceId);
  }

  /** Undo one. The money goes back on the bill; payments are untouched. */
  async revoke(discountId: string) {
    const client = await this.tenantPrisma.getClient();

    const discount = await client.feeDiscount.findUnique({
      where: { id: discountId },
      include: { invoice: true },
    });
    if (!discount) throw new NotFoundException("No discount found with that id");

    const outcome = removeDiscount(discount.invoice, discount.amountCents);

    await client.$transaction([
      client.feeDiscount.delete({ where: { id: discountId } }),
      client.feeInvoice.update({
        where: { id: discount.invoiceId },
        data: {
          totalCents: outcome.totalCents,
          discountCents: outcome.discountCents,
          status: deriveInvoiceStatus(outcome.totalCents, discount.invoice.paidCents, discount.invoice.status),
        },
      }),
    ]);

    return this.forInvoice(discount.invoiceId);
  }

  /** Every reduction on one invoice, and what it now comes to. */
  async forInvoice(invoiceId: string) {
    const client = await this.tenantPrisma.getClient();

    const invoice = await client.feeInvoice.findUnique({
      where: { id: invoiceId },
      include: { discounts: { orderBy: { createdAt: "asc" }, include: { scholarship: true } } },
    });
    if (!invoice) throw new NotFoundException("No invoice found with that id");

    return {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      currency: invoice.currency,
      /** What the fee lines add up to, before anything was taken off. */
      grossCents: invoice.totalCents + invoice.discountCents,
      discountCents: invoice.discountCents,
      payableCents: invoice.totalCents,
      paidCents: invoice.paidCents,
      discounts: invoice.discounts.map((discount) => ({
        id: discount.id,
        label: discount.label,
        describedAs: describeDiscount({ kind: discount.kind as DiscountKind, value: discount.value }, invoice.currency),
        amountCents: discount.amountCents,
        reason: discount.reason,
        fromScholarship: discount.scholarship?.name ?? null,
        grantedByName: discount.grantedByName,
        createdAt: discount.createdAt,
      })),
    };
  }

  /* ------------------------------------------------------------- awards */

  async award(input: AwardInput, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const student = await client.studentProfile.findFirst({
      where: { id: input.studentProfileId, deletedAt: null },
    });
    if (!student) throw new NotFoundException("No student found with that id");

    if (input.kind === "PERCENT" && (input.value <= 0 || input.value > 100)) {
      throw new BadRequestException("A percentage must be between 0 and 100.");
    }
    if (input.kind === "FIXED" && (!Number.isInteger(input.value) || input.value <= 0)) {
      throw new BadRequestException("An award must be a whole amount greater than zero.");
    }

    const start = input.startDate ? new Date(input.startDate) : null;
    const end = input.endDate ? new Date(input.endDate) : null;
    if (start && end && end.getTime() < start.getTime()) {
      throw new BadRequestException("The award cannot end before it starts.");
    }

    return client.scholarship.create({
      data: {
        studentProfileId: input.studentProfileId,
        name: input.name.trim(),
        sponsor: input.sponsor?.trim() || null,
        kind: input.kind,
        value: input.value,
        startDate: start,
        endDate: end,
        awardedByUserId: viewer.id,
        awardedByName: await this.actorName(viewer.id),
      },
    });
  }

  /**
   * Stop an award without erasing what it already gave.
   *
   * Withdrawn rather than deleted: the discounts it produced stay on the
   * invoices they were granted against, and a school has to be able to
   * explain a bill it has already sent.
   */
  async withdraw(scholarshipId: string, reason: string) {
    const client = await this.tenantPrisma.getClient();
    const award = await client.scholarship.findUnique({ where: { id: scholarshipId } });
    if (!award) throw new NotFoundException("No scholarship found with that id");

    return client.scholarship.update({
      where: { id: scholarshipId },
      data: { status: "WITHDRAWN", withdrawnReason: reason.trim() || null },
    });
  }

  async listAwards(studentProfileId?: string) {
    const client = await this.tenantPrisma.getClient();
    const settings = await client.financeSettings.findFirst({ select: { currency: true } });
    const currency = settings?.currency ?? "NGN";

    const awards = await client.scholarship.findMany({
      where: {
        ...(studentProfileId ? { studentProfileId } : {}),
        studentProfile: { deletedAt: null },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        studentProfile: { select: { user: { select: { firstName: true, lastName: true } } } },
        _count: { select: { discounts: true } },
      },
    });

    return awards.map((award) => ({
      id: award.id,
      studentProfileId: award.studentProfileId,
      studentName: `${award.studentProfile.user.firstName} ${award.studentProfile.user.lastName}`,
      name: award.name,
      sponsor: award.sponsor,
      kind: award.kind,
      value: award.value,
      describedAs: describeAward(
        { kind: award.kind as DiscountKind, value: award.value, startDate: award.startDate, endDate: award.endDate, status: award.status },
        currency,
      ),
      status: award.status,
      startDate: award.startDate,
      endDate: award.endDate,
      awardedByName: award.awardedByName,
      withdrawnReason: award.withdrawnReason,
      /** How many bills it has actually reduced — an award nobody has used is worth questioning. */
      timesApplied: award._count.discounts,
    }));
  }

  /**
   * The awards that should reduce an invoice raised today for this student.
   *
   * Called by invoice generation so a scholarship reaches bills that did not
   * exist when it was granted, which is the entire point of it being standing
   * rather than a discount.
   */
  async applicableAwards(studentProfileId: string, on: Date) {
    const client = await this.tenantPrisma.getClient();
    const awards = await client.scholarship.findMany({
      where: { studentProfileId, status: "ACTIVE" },
    });
    return awards.filter((award) =>
      scholarshipApplies(
        { kind: award.kind as DiscountKind, value: award.value, startDate: award.startDate, endDate: award.endDate, status: award.status },
        on,
      ),
    );
  }
}
