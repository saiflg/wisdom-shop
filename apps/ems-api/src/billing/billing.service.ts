import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { InvoiceStatus, Prisma } from "ems-control-client";
import { ControlPrismaService } from "@/control-db/control-prisma.service";
import { addInterval, computeInvoiceTotals, formatInvoiceNumber, periodFor, type InvoiceLineInput } from "./billing-math";
import { explainInvoiceRefusal, explainSubscriptionRefusal } from "./billing-status";
import { selectCycleWork } from "./billing-cycle";
import type { CreatePlanDto, GenerateInvoiceDto, SubscribeSchoolDto, UpdatePlanDto } from "./dto/billing.dto";

const DEFAULT_DUE_DAYS = 14;

/** Prisma's unique-constraint violation. */
const UNIQUE_VIOLATION = "P2002";

export interface BillingCycleResult {
  ranAt: string;
  trialsActivated: number;
  renewed: number;
  cancelled: number;
  invoicesCreated: string[];
  /** Renewals whose invoice already existed — the idempotency guard firing. */
  duplicatesSkipped: number;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly controlPrisma: ControlPrismaService) {}

  // ── Plans ────────────────────────────────────────────────────────────

  listPlans() {
    return this.controlPrisma.subscriptionPlan.findMany({ orderBy: [{ isActive: "desc" }, { priceCents: "asc" }] });
  }

  async createPlan(dto: CreatePlanDto) {
    const existing = await this.controlPrisma.subscriptionPlan.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException("A plan with that code already exists");
    return this.controlPrisma.subscriptionPlan.create({ data: { ...dto, currency: dto.currency.toUpperCase() } });
  }

  /**
   * Repricing only affects future subscriptions — existing ones keep the
   * price snapshotted onto them, so a customer never sees their bill change
   * because someone edited the catalogue.
   */
  async updatePlan(id: string, dto: UpdatePlanDto) {
    await this.getPlan(id);
    return this.controlPrisma.subscriptionPlan.update({ where: { id }, data: dto });
  }

  private async getPlan(id: string) {
    const plan = await this.controlPrisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException("No plan found with that id");
    return plan;
  }

  // ── Subscriptions ────────────────────────────────────────────────────

  async getSubscription(schoolId: string) {
    return this.controlPrisma.subscription.findUnique({
      where: { schoolId },
      include: { plan: true },
    });
  }

  async subscribe(schoolId: string, dto: SubscribeSchoolDto) {
    const school = await this.controlPrisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new NotFoundException("No school found with that id");

    const plan = await this.getPlan(dto.planId);
    if (!plan.isActive) throw new ConflictException("That plan is retired and cannot be assigned to a new subscription");

    const existing = await this.controlPrisma.subscription.findUnique({ where: { schoolId } });
    if (existing && existing.status !== "CANCELED") {
      throw new ConflictException("This school already has a subscription — change its plan instead");
    }

    const now = new Date();
    const trialEndsAt = dto.trialDays
      ? new Date(now.getTime() + dto.trialDays * 24 * 60 * 60 * 1000)
      : null;
    // A trial delays the first paid period rather than shortening it.
    const periodStart = trialEndsAt ?? now;
    const { start, end } = periodFor(periodStart, plan.interval);

    const data = {
      planId: plan.id,
      status: trialEndsAt ? ("TRIALING" as const) : ("ACTIVE" as const),
      priceCents: plan.priceCents,
      currency: plan.currency,
      interval: plan.interval,
      currentPeriodStart: start,
      currentPeriodEnd: end,
      trialEndsAt,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    };

    // A previously cancelled subscription is replaced rather than revived,
    // matching the terminal CANCELED rule in billing-status.ts.
    return existing
      ? this.controlPrisma.subscription.update({ where: { schoolId }, data, include: { plan: true } })
      : this.controlPrisma.subscription.create({ data: { schoolId, ...data }, include: { plan: true } });
  }

  async changePlan(schoolId: string, planId: string) {
    const subscription = await this.requireSubscription(schoolId);
    if (subscription.status === "CANCELED") {
      throw new ConflictException("This subscription was cancelled — create a new one instead");
    }
    const plan = await this.getPlan(planId);
    if (!plan.isActive) throw new ConflictException("That plan is retired and cannot be assigned");

    // Takes effect from the next period; no mid-period proration is
    // modelled yet, which is why the current period is left untouched.
    return this.controlPrisma.subscription.update({
      where: { schoolId },
      data: { planId: plan.id, priceCents: plan.priceCents, currency: plan.currency, interval: plan.interval },
      include: { plan: true },
    });
  }

  async setSubscriptionStatus(schoolId: string, to: "ACTIVE" | "PAST_DUE" | "CANCELED") {
    const subscription = await this.requireSubscription(schoolId);
    const refusal = explainSubscriptionRefusal(subscription.status, to);
    if (refusal) throw new ConflictException(refusal);

    return this.controlPrisma.subscription.update({
      where: { schoolId },
      data: { status: to, ...(to === "CANCELED" ? { canceledAt: new Date() } : {}) },
      include: { plan: true },
    });
  }

  private async requireSubscription(schoolId: string) {
    const subscription = await this.controlPrisma.subscription.findUnique({ where: { schoolId } });
    if (!subscription) throw new NotFoundException("This school has no subscription");
    return subscription;
  }

  // ── Invoices ─────────────────────────────────────────────────────────

  listInvoices(schoolId?: string) {
    return this.controlPrisma.invoice.findMany({
      where: schoolId ? { schoolId } : undefined,
      include: { lines: true, school: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async getInvoice(number: string) {
    const invoice = await this.controlPrisma.invoice.findUnique({
      where: { number },
      include: { lines: true, school: { select: { name: true, slug: true } } },
    });
    if (!invoice) throw new NotFoundException("No invoice with that number");
    return invoice;
  }

  /**
   * Creates a DRAFT invoice for a school's current period.
   *
   * The counter row is read and written inside the same transaction as the
   * insert, so two operators generating invoices at the same moment can't
   * be handed the same number — the second transaction blocks on the
   * counter row until the first commits. Generating the number outside the
   * transaction (e.g. count() + 1) is the classic way to get duplicates.
   */
  async generateInvoice(schoolId: string, dto: GenerateInvoiceDto) {
    const school = await this.controlPrisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new NotFoundException("No school found with that id");

    const subscription = await this.controlPrisma.subscription.findUnique({
      where: { schoolId },
      include: { plan: true },
    });

    const lineInputs: InvoiceLineInput[] = dto.lines?.length
      ? dto.lines
      : subscription
        ? [{ description: `${subscription.plan.name} subscription`, quantity: 1, unitPriceCents: subscription.priceCents }]
        : [];

    if (lineInputs.length === 0) {
      throw new BadRequestException("This school has no subscription, so invoice lines must be provided explicitly");
    }

    const totals = computeInvoiceTotals(lineInputs);
    const currency = subscription?.currency ?? "NGN";
    const now = new Date();
    const dueAt = new Date(now.getTime() + (dto.dueInDays ?? DEFAULT_DUE_DAYS) * 24 * 60 * 60 * 1000);

    return this.controlPrisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const counter = await tx.invoiceCounter.upsert({
        where: { id: 1 },
        create: { id: 1, lastUsed: 1 },
        update: { lastUsed: { increment: 1 } },
      });

      return tx.invoice.create({
        data: {
          number: formatInvoiceNumber(counter.lastUsed),
          schoolId,
          subscriptionId: subscription?.id ?? null,
          status: "DRAFT",
          // Operator-raised: intentionally exempt from the one-per-period
          // guard so ad-hoc charges inside a period are possible.
          origin: "MANUAL",
          currency,
          subtotalCents: totals.subtotalCents,
          totalCents: totals.totalCents,
          periodStart: subscription?.currentPeriodStart ?? now,
          periodEnd: subscription?.currentPeriodEnd ?? now,
          dueAt,
          lines: { create: totals.lines },
        },
        include: { lines: true, school: { select: { name: true, slug: true } } },
      });
    });
  }

  async setInvoiceStatus(number: string, to: InvoiceStatus) {
    const invoice = await this.getInvoice(number);
    const refusal = explainInvoiceRefusal(invoice.status, to);
    if (refusal) throw new ConflictException(refusal);

    const now = new Date();
    return this.controlPrisma.invoice.update({
      where: { number },
      data: {
        status: to,
        ...(to === "OPEN" ? { issuedAt: now } : {}),
        ...(to === "PAID" ? { paidAt: now } : {}),
        ...(to === "VOID" ? { voidedAt: now } : {}),
      },
      include: { lines: true, school: { select: { name: true, slug: true } } },
    });
  }

  // ── Billing cycle ────────────────────────────────────────────────────

  /**
   * Advances every subscription whose period has ended, converts expired
   * trials, applies scheduled cancellations, and invoices each renewal.
   *
   * Safe to run repeatedly and concurrently. Correctness does not depend on
   * the scheduler firing exactly once — it depends on the unique index on
   * (subscriptionId, periodStart). A second run for the same period loses
   * the race at the database and is counted as a skip rather than becoming
   * a second charge. That is deliberate: "the timer fired twice" is a
   * normal event in any deployment with more than one instance, a restart,
   * or a manual trigger, and it must never cost a customer money.
   */
  async runBillingCycle(now = new Date()): Promise<BillingCycleResult> {
    const subscriptions = await this.controlPrisma.subscription.findMany({
      where: { status: { not: "CANCELED" } },
      include: { plan: true },
    });

    const work = selectCycleWork(
      subscriptions.map((s) => ({
        id: s.id,
        schoolId: s.schoolId,
        status: s.status,
        currentPeriodEnd: s.currentPeriodEnd,
        trialEndsAt: s.trialEndsAt,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      })),
      now,
    );

    const invoicesCreated: string[] = [];
    let duplicatesSkipped = 0;

    for (const trial of work.trialsToActivate) {
      await this.controlPrisma.subscription.update({
        where: { id: trial.id },
        data: { status: "ACTIVE" },
      });
    }

    for (const cancellation of work.toCancel) {
      await this.controlPrisma.subscription.update({
        where: { id: cancellation.id },
        data: { status: "CANCELED", canceledAt: now },
      });
    }

    for (const due of work.toRenew) {
      const subscription = subscriptions.find((s) => s.id === due.id);
      if (!subscription) continue;

      // Periods are contiguous: the next one starts where the last ended,
      // not at "now", so a late cycle run cannot lose billable days.
      const periodStart = subscription.currentPeriodEnd;
      const periodEnd = addInterval(periodStart, subscription.interval);

      try {
        const invoice = await this.createPeriodInvoice(subscription, periodStart, periodEnd, now);
        invoicesCreated.push(invoice.number);
      } catch (error) {
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
          // Already invoiced for this exact period by another run.
          duplicatesSkipped += 1;
          continue;
        }
        throw error;
      }

      await this.controlPrisma.subscription.update({
        where: { id: subscription.id },
        data: { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd },
      });
    }

    const result: BillingCycleResult = {
      ranAt: now.toISOString(),
      trialsActivated: work.trialsToActivate.length,
      renewed: invoicesCreated.length,
      cancelled: work.toCancel.length,
      invoicesCreated,
      duplicatesSkipped,
    };

    if (result.renewed || result.trialsActivated || result.cancelled || result.duplicatesSkipped) {
      this.logger.log(`Billing cycle: ${JSON.stringify(result)}`);
    }
    return result;
  }

  private createPeriodInvoice(
    subscription: { id: string; schoolId: string; priceCents: number; currency: string; plan: { name: string } },
    periodStart: Date,
    periodEnd: Date,
    now: Date,
  ) {
    const totals = computeInvoiceTotals([
      { description: `${subscription.plan.name} subscription`, quantity: 1, unitPriceCents: subscription.priceCents },
    ]);

    return this.controlPrisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const counter = await tx.invoiceCounter.upsert({
        where: { id: 1 },
        create: { id: 1, lastUsed: 1 },
        update: { lastUsed: { increment: 1 } },
      });

      return tx.invoice.create({
        data: {
          number: formatInvoiceNumber(counter.lastUsed),
          schoolId: subscription.schoolId,
          subscriptionId: subscription.id,
          status: "DRAFT",
          // The guarded path: the partial unique index makes a second
          // invoice for this period impossible.
          origin: "CYCLE",
          currency: subscription.currency,
          subtotalCents: totals.subtotalCents,
          totalCents: totals.totalCents,
          periodStart,
          periodEnd,
          dueAt: new Date(now.getTime() + DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000),
          lines: { create: totals.lines },
        },
        include: { lines: true },
      });
    });
  }

  // ── Revenue ──────────────────────────────────────────────────────────

  /**
   * Deliberately reports collected and outstanding separately rather than
   * one "revenue" figure: money invoiced is not money received, and
   * conflating them is how a dashboard flatters itself.
   */
  async revenueSummary() {
    const [paid, open, subscriptionsByStatus] = await Promise.all([
      this.controlPrisma.invoice.groupBy({ by: ["currency"], where: { status: "PAID" }, _sum: { totalCents: true } }),
      this.controlPrisma.invoice.groupBy({
        by: ["currency"],
        where: { status: { in: ["OPEN", "UNCOLLECTIBLE"] } },
        _sum: { totalCents: true },
      }),
      this.controlPrisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    return {
      collected: paid.map((row) => ({ currency: row.currency, amountCents: row._sum.totalCents ?? 0 })),
      outstanding: open.map((row) => ({ currency: row.currency, amountCents: row._sum.totalCents ?? 0 })),
      subscriptions: subscriptionsByStatus.map((row) => ({ status: row.status, count: row._count._all })),
    };
  }
}
