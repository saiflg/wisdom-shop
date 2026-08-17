import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { FeeInvoiceStatus, PrismaClient as TenantPrismaClient, RoleName } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { MessagingService } from "@/messaging/messaging.service";
// A generic minor-units formatter rather than billing policy — reused so
// school fees and platform billing cannot drift apart on how money reads.
import { formatMoney } from "@/billing/billing-math";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import {
  applyPayment,
  balanceOf,
  computeFeeTotal,
  deriveInvoiceStatus,
  formatFeeInvoiceNumber,
  summariseFees,
} from "./fees-math";
import { buildReceipt, formatReceiptNumber } from "./receipts";
import type {
  CreateFeeInvoiceDto,
  CreateFeeStructureDto,
  GenerateInvoicesDto,
  RecordPaymentDto,
  UpdateFeeStructureDto,
  UpdateFinanceSettingsDto,
  VoidInvoiceDto,
} from "./dto/fees.dto";

/**
 * Money is SCHOOL_ADMIN-only for this phase — teachers get no finance access
 * at all. There is no BURSAR role yet; adding one is the natural next step
 * and this constant is the single place that changes when it arrives.
 */
const FINANCE_ROLES: RoleName[] = ["SCHOOL_ADMIN"];

const UNIQUE_VIOLATION = "P2002";

function isFinanceStaff(viewer: AuthenticatedUser): boolean {
  return viewer.roles.some((role) => FINANCE_ROLES.includes(role));
}

const INVOICE_INCLUDE = {
  lines: true,
  payments: { orderBy: { receivedAt: "desc" as const } },
  feeStructure: { select: { id: true, name: true } },
  studentProfile: {
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  },
};

@Injectable()
export class FeesService {
  private readonly logger = new Logger(FeesService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly messaging: MessagingService,
  ) {}

  // ---------------------------------------------------------------- settings

  async getSettings() {
    const client = await this.tenantPrisma.getClient();
    const settings = await client.financeSettings.findFirst();
    // Seeded at provisioning, so its absence is a broken tenant rather than
    // a first-use case to paper over.
    if (!settings) throw new NotFoundException("This school has no finance settings");
    return settings;
  }

  async updateSettings(dto: UpdateFinanceSettingsDto) {
    const client = await this.tenantPrisma.getClient();
    const settings = await this.getSettings();

    if (dto.currency && dto.currency !== settings.currency) {
      // Changing currency once invoices exist would silently reinterpret
      // every stored amount — 25000000 kobo is not 25000000 cents.
      const invoiced = await client.feeInvoice.count();
      if (invoiced > 0) {
        throw new ConflictException(
          "The school currency cannot be changed once invoices exist, because every stored amount is in its minor units",
        );
      }
    }

    return client.financeSettings.update({
      where: { id: settings.id },
      data: { ...(dto.currency ? { currency: dto.currency.toUpperCase() } : {}) },
    });
  }

  // -------------------------------------------------------------- structures

  async createStructure(dto: CreateFeeStructureDto) {
    const client = await this.tenantPrisma.getClient();
    // Validates the amounts before anything is written.
    computeFeeTotal(dto.items);

    if (dto.classId) {
      const klass = await client.class.findFirst({ where: { id: dto.classId, deletedAt: null } });
      if (!klass) throw new NotFoundException("No class found with that id");
    }

    try {
      return await client.feeStructure.create({
        data: {
          name: dto.name,
          academicYear: dto.academicYear,
          term: dto.term,
          classId: dto.classId ?? null,
          items: { create: dto.items.map((item) => ({ label: item.label, amountCents: item.amountCents })) },
        },
        include: { items: true, class: { select: { id: true, name: true } } },
      });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException("A fee structure with that name already exists for that year and term");
      }
      throw error;
    }
  }

  async listStructures() {
    const client = await this.tenantPrisma.getClient();
    return client.feeStructure.findMany({
      where: { deletedAt: null },
      include: { items: true, class: { select: { id: true, name: true } }, _count: { select: { invoices: true } } },
      orderBy: [{ academicYear: "desc" }, { term: "asc" }, { name: "asc" }],
    });
  }

  async getStructure(id: string) {
    const client = await this.tenantPrisma.getClient();
    const structure = await client.feeStructure.findFirst({
      where: { id, deletedAt: null },
      include: { items: true, class: { select: { id: true, name: true } } },
    });
    if (!structure) throw new NotFoundException("No fee structure found with that id");
    return structure;
  }

  async updateStructure(id: string, dto: UpdateFeeStructureDto) {
    const client = await this.tenantPrisma.getClient();
    await this.getStructure(id);

    if (dto.items) {
      computeFeeTotal(dto.items);
      // Invoices already raised keep their own line snapshot, so repricing a
      // structure never changes what an existing family has been told to pay
      // — the same rule as platform subscription prices.
      await client.$transaction([
        client.feeItem.deleteMany({ where: { feeStructureId: id } }),
        client.feeItem.createMany({
          data: dto.items.map((item) => ({ feeStructureId: id, label: item.label, amountCents: item.amountCents })),
        }),
      ]);
    }

    if (dto.name) {
      await client.feeStructure.update({ where: { id }, data: { name: dto.name } });
    }

    return this.getStructure(id);
  }

  async deleteStructure(id: string) {
    const client = await this.tenantPrisma.getClient();
    await this.getStructure(id);
    await client.feeStructure.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  // ---------------------------------------------------------------- invoices

  /**
   * Raises one invoice per eligible student for a structure.
   *
   * Safe to run twice. The unique index on (studentProfileId, feeStructureId)
   * is what guarantees that, not a pre-flight check: two operators clicking
   * at the same moment both pass any check-then-insert, and the second one
   * loses at the database instead of charging a family twice. Duplicates are
   * counted and reported rather than raised as an error, because "run it
   * again after adding a student" is a normal thing for a bursar to do.
   */
  async generateInvoices(structureId: string, dto: GenerateInvoicesDto) {
    const client = await this.tenantPrisma.getClient();
    const structure = await this.getStructure(structureId);
    const settings = await this.getSettings();

    const total = computeFeeTotal(structure.items);
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    const enrollments = await client.enrollment.findMany({
      where: {
        status: "ACTIVE",
        ...(structure.classId ? { classId: structure.classId } : {}),
      },
      select: { studentProfileId: true },
    });

    // A school-wide structure can reach the same student through two active
    // enrollments; dedupe before writing rather than relying on the index.
    const studentIds = [...new Set(enrollments.map((e) => e.studentProfileId))];

    const created: string[] = [];
    let duplicatesSkipped = 0;

    for (const studentProfileId of studentIds) {
      try {
        const invoice = await client.$transaction(async (tx) => {
          const counted = await tx.financeSettings.update({
            where: { id: settings.id },
            data: { invoiceCounter: { increment: 1 } },
          });
          return tx.feeInvoice.create({
            data: {
              invoiceNumber: formatFeeInvoiceNumber(counted.invoiceCounter),
              studentProfileId,
              feeStructureId: structure.id,
              academicYear: structure.academicYear,
              term: structure.term,
              currency: settings.currency,
              totalCents: total,
              // Raised as ISSUED, not DRAFT: generating invoices for a class
              // is the deliberate act of billing them.
              status: deriveInvoiceStatus(total, 0, "ISSUED"),
              issuedAt: new Date(),
              dueDate,
              lines: {
                create: structure.items.map((item) => ({ label: item.label, amountCents: item.amountCents })),
              },
            },
          });
        });
        created.push(invoice.id);

        // Only on a genuinely new invoice — the duplicate path below skips
        // this, so re-running invoice generation cannot re-notify a family
        // about a bill they were already told about.
        await this.messaging.notify({
          event: "FEE_INVOICE_ISSUED",
          studentProfileId,
          dedupeParts: [invoice.invoiceNumber],
          context: {
            invoiceNumber: invoice.invoiceNumber,
            amount: formatMoney(total, settings.currency),
            dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : "—",
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
          duplicatesSkipped += 1;
          continue;
        }
        throw error;
      }
    }

    return {
      structureId: structure.id,
      eligibleStudents: studentIds.length,
      invoicesCreated: created.length,
      duplicatesSkipped,
    };
  }

  /** A one-off invoice not tied to a structure — a trip, a replacement book. */
  async createInvoice(dto: CreateFeeInvoiceDto) {
    const client = await this.tenantPrisma.getClient();
    const settings = await this.getSettings();
    const total = computeFeeTotal(dto.lines);

    const student = await client.studentProfile.findFirst({ where: { id: dto.studentProfileId, deletedAt: null } });
    if (!student) throw new NotFoundException("No student found with that id");

    return client.$transaction(async (tx) => {
      const counted = await tx.financeSettings.update({
        where: { id: settings.id },
        data: { invoiceCounter: { increment: 1 } },
      });
      return tx.feeInvoice.create({
        data: {
          invoiceNumber: formatFeeInvoiceNumber(counted.invoiceCounter),
          studentProfileId: dto.studentProfileId,
          academicYear: dto.academicYear,
          term: dto.term,
          currency: settings.currency,
          totalCents: total,
          status: deriveInvoiceStatus(total, 0, "ISSUED"),
          issuedAt: new Date(),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          note: dto.note,
          lines: { create: dto.lines.map((line) => ({ label: line.label, amountCents: line.amountCents })) },
        },
        include: INVOICE_INCLUDE,
      });
    });
  }

  async listInvoices(viewer: AuthenticatedUser, studentProfileId?: string) {
    const client = await this.tenantPrisma.getClient();

    let where: { studentProfileId?: string | { in: string[] } } = {};
    if (isFinanceStaff(viewer)) {
      if (studentProfileId) where = { studentProfileId };
    } else {
      // A family sees its own invoices and nothing else. Narrowed to the
      // intersection when they also ask for a specific student, so a filter
      // can never widen what they are allowed to see.
      const visible = await this.visibleStudentProfileIds(viewer);
      const ids = studentProfileId
        ? [...visible].filter((id) => id === studentProfileId)
        : [...visible];
      where = { studentProfileId: { in: ids } };
    }

    const invoices = await client.feeInvoice.findMany({
      where,
      include: INVOICE_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    return {
      invoices: invoices.map((invoice) => ({
        ...invoice,
        balanceCents: balanceOf(invoice.totalCents, invoice.paidCents),
      })),
      summary: summariseFees(invoices),
    };
  }

  async getInvoice(id: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const invoice = await client.feeInvoice.findFirst({ where: { id }, include: INVOICE_INCLUDE });
    if (!invoice) throw new NotFoundException("No invoice found with that id");

    if (!isFinanceStaff(viewer)) {
      const visible = await this.visibleStudentProfileIds(viewer);
      // 404 rather than 403: "that invoice exists but isn't yours" is itself
      // a leak about another family.
      if (!visible.has(invoice.studentProfileId)) throw new NotFoundException("No invoice found with that id");
    }

    return { ...invoice, balanceCents: balanceOf(invoice.totalCents, invoice.paidCents) };
  }

  // ---------------------------------------------------------------- payments

  /**
   * Records money received against an invoice.
   *
   * The payment row and the invoice's running total move in one transaction,
   * so a receipt can never exist without the balance that reflects it. The
   * amount is checked by `applyPayment`, which refuses overpayment outright.
   */
  async recordPayment(invoiceId: string, dto: RecordPaymentDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const invoice = await client.feeInvoice.findFirst({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException("No invoice found with that id");

    let outcome: { paidCents: number; status: FeeInvoiceStatus };
    try {
      outcome = applyPayment(invoice.totalCents, invoice.paidCents, invoice.status, dto.amountCents);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    const actor = await client.user.findUnique({
      where: { id: viewer.id },
      select: { firstName: true, lastName: true },
    });
    const recordedByName = actor ? `${actor.firstName} ${actor.lastName}` : viewer.id;

    let payment: { id: string; receiptNumber: string | null; receivedAt: Date };
    try {
      payment = await client.$transaction(async (tx) => {
        // The number is claimed inside the same transaction as the insert
        // that uses it, exactly as invoice numbers are — counting rows
        // outside would hand two simultaneous payments the same receipt.
        const counted = await tx.financeSettings.update({
          where: { id: (await tx.financeSettings.findFirstOrThrow({ select: { id: true } })).id },
          data: { receiptCounter: { increment: 1 } },
        });

        const created = await tx.feePayment.create({
          data: {
            invoiceId,
            amountCents: dto.amountCents,
            method: dto.method,
            reference: dto.reference ?? null,
            receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
            note: dto.note,
            receiptNumber: formatReceiptNumber(counted.receiptCounter),
            recordedByUserId: viewer.id,
            recordedByName,
          },
          select: { id: true, receiptNumber: true, receivedAt: true },
        });

        await tx.feeInvoice.update({
          where: { id: invoiceId },
          data: { paidCents: outcome.paidCents, status: outcome.status },
        });

        return created;
      });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        // The reference has already been recorded against this invoice — a
        // replayed webhook or a double-submitted form. Nothing was written.
        throw new ConflictException("A payment with that reference has already been recorded against this invoice");
      }
      throw error;
    }

    // After the money is safely recorded, never as part of the transaction: a
    // mail server being slow must not roll back a payment. Failures land in
    // the outbox, and the dashboard says so.
    await this.confirmPayment({
      invoiceId,
      amountCents: dto.amountCents,
      method: dto.method,
      receiptNumber: payment.receiptNumber,
      receivedAt: payment.receivedAt,
      paidCents: outcome.paidCents,
    });

    return this.getInvoice(invoiceId, viewer);
  }

  /**
   * Tells the family their money arrived.
   *
   * Both payment paths end here — a bursar recording cash and a gateway
   * webhook produce the same confirmation, because a parent should not be
   * able to tell from the receipt how the school found out.
   *
   * Never throws: the payment is already recorded and correct, and a
   * notification failure must not make it look otherwise.
   */
  private async confirmPayment(input: {
    invoiceId: string;
    amountCents: number;
    method: string;
    receiptNumber: string | null;
    receivedAt: Date;
    paidCents: number;
  }): Promise<void> {
    try {
      const client = await this.tenantPrisma.getClient();
      const invoice = await client.feeInvoice.findUnique({
        where: { id: input.invoiceId },
        include: { studentProfile: { include: { user: { select: { firstName: true, lastName: true } } } } },
      });
      if (!invoice || !input.receiptNumber) return;

      const receipt = buildReceipt({
        receiptNumber: input.receiptNumber,
        invoiceNumber: invoice.invoiceNumber,
        studentName: `${invoice.studentProfile.user.firstName} ${invoice.studentProfile.user.lastName}`,
        amountCents: input.amountCents,
        totalCents: invoice.totalCents,
        paidCents: input.paidCents,
        currency: invoice.currency,
        method: input.method,
        receivedAt: input.receivedAt,
      });

      await this.messaging.notify({
        event: "FEE_PAYMENT_RECEIVED",
        studentProfileId: invoice.studentProfileId,
        // The receipt number, not the invoice: a second payment against the
        // same invoice is a second confirmation, and deduping on the invoice
        // would silently swallow it.
        dedupeParts: [receipt.receiptNumber],
        context: {
          receiptNumber: receipt.receiptNumber,
          invoiceNumber: receipt.invoiceNumber,
          amountPaid: receipt.amountPaid,
          balance: receipt.balance,
          method: receipt.method,
          paidOn: receipt.paidOn,
        },
      });
    } catch (error) {
      this.logger.error(`Payment confirmation failed for invoice ${input.invoiceId}: ${String(error)}`);
    }
  }

  /**
   * Records money that arrived through a payment gateway.
   *
   * Separate from `recordPayment` because there is no viewer: nobody in the
   * school took this money, so it cannot be attributed to a person who was
   * not there. Everything else — the balance arithmetic, the status
   * transition, the unique reference — goes through the same code, because a
   * second way of crediting an invoice is a second way of getting it wrong.
   *
   * Returns "duplicate" rather than throwing on a replayed webhook: that is
   * the expected case, not an error, and a provider that receives an error
   * will keep retrying.
   */
  async creditGatewayPayment(input: {
    client: TenantPrismaClient;
    invoiceId: string;
    amountCents: number;
    reference: string;
    note: string;
    recordedByName: string;
  }): Promise<"recorded" | "duplicate" | { refused: string }> {
    const invoice = await input.client.feeInvoice.findFirst({ where: { id: input.invoiceId } });
    if (!invoice) return { refused: "no such invoice" };

    let outcome: { paidCents: number; status: FeeInvoiceStatus };
    try {
      outcome = applyPayment(invoice.totalCents, invoice.paidCents, invoice.status, input.amountCents);
    } catch (error) {
      return { refused: (error as Error).message };
    }

    let payment: { receiptNumber: string | null; receivedAt: Date };
    try {
      payment = await input.client.$transaction(async (tx) => {
        const settings = await tx.financeSettings.findFirstOrThrow({ select: { id: true } });
        const counted = await tx.financeSettings.update({
          where: { id: settings.id },
          data: { receiptCounter: { increment: 1 } },
        });

        const created = await tx.feePayment.create({
          data: {
            invoiceId: input.invoiceId,
            amountCents: input.amountCents,
            method: "GATEWAY",
            reference: input.reference,
            note: input.note,
            receiptNumber: formatReceiptNumber(counted.receiptCounter),
            // No school user was involved. Recording one would be a lie in
            // the one table that answers "who took the money".
            recordedByUserId: "gateway",
            recordedByName: input.recordedByName,
          },
          select: { receiptNumber: true, receivedAt: true },
        });

        await tx.feeInvoice.update({
          where: { id: input.invoiceId },
          data: { paidCents: outcome.paidCents, status: outcome.status },
        });

        return created;
      });
    } catch (error) {
      // The unique index on (invoiceId, reference) IS the idempotency here.
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) return "duplicate";
      throw error;
    }

    // A parent paying online gets the same receipt as one paying at the desk.
    // A replayed webhook returns above and never reaches here, so a duplicate
    // callback cannot produce a second confirmation.
    await this.confirmPayment({
      invoiceId: input.invoiceId,
      amountCents: input.amountCents,
      method: "GATEWAY",
      receiptNumber: payment.receiptNumber,
      receivedAt: payment.receivedAt,
      paidCents: outcome.paidCents,
    });

    return "recorded";
  }

  /**
   * Voids an invoice raised in error. Deliberately not a delete: a family
   * may already have been sent it, so it has to remain visible and explained.
   */
  async voidInvoice(id: string, dto: VoidInvoiceDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const invoice = await client.feeInvoice.findFirst({ where: { id } });
    if (!invoice) throw new NotFoundException("No invoice found with that id");

    if (invoice.status === "VOID") throw new ConflictException("That invoice is already void");
    if (invoice.paidCents > 0) {
      throw new ConflictException(
        "That invoice has payments against it and cannot be voided; refund and reconcile it instead",
      );
    }

    await client.feeInvoice.update({
      where: { id },
      data: {
        status: "VOID",
        voidedAt: new Date(),
        note: invoice.note ? `${invoice.note}\nVoided: ${dto.reason}` : `Voided: ${dto.reason}`,
      },
    });

    return this.getInvoice(id, viewer);
  }

  async summary() {
    const client = await this.tenantPrisma.getClient();
    const invoices = await client.feeInvoice.findMany({
      select: { totalCents: true, paidCents: true, status: true },
    });
    const settings = await this.getSettings();
    return { currency: settings.currency, ...summariseFees(invoices) };
  }

  /** Student profiles this non-staff viewer is allowed to see. */
  private async visibleStudentProfileIds(viewer: AuthenticatedUser): Promise<Set<string>> {
    const client = await this.tenantPrisma.getClient();

    if (viewer.roles.includes("GUARDIAN")) {
      const links = await client.guardianLink.findMany({
        where: { guardianUserId: viewer.id },
        select: { studentProfileId: true },
      });
      return new Set(links.map((link) => link.studentProfileId));
    }

    const own = await client.studentProfile.findUnique({ where: { userId: viewer.id }, select: { id: true } });
    return new Set(own ? [own.id] : []);
  }
}
