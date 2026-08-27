import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import type { CreateExpenseDto } from "./dto/create-expense.dto";
import type { UpdateExpenseDto } from "./dto/update-expense.dto";
import type { DecideExpenseDto } from "./dto/decide-expense.dto";
import {
  availableTransitions,
  checkTransition,
  summariseExpenses,
  validateExpenseAmount,
  type ExpenseStatus,
} from "./expense-rules";

@Injectable()
export class ExpensesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateExpenseDto, actor: AuthenticatedUser) {
    const problem = validateExpenseAmount(dto.amountCents);
    if (problem) throw new BadRequestException(problem);

    const client = await this.tenantPrisma.getClient();
    return client.expense.create({
      data: {
        category: dto.category.trim(),
        description: dto.description.trim(),
        amountCents: dto.amountCents,
        // When the money was spent, not when it was typed up. A receipt from
        // last Tuesday belongs in last Tuesday.
        incurredOn: new Date(dto.incurredOn),
        payee: dto.payee?.trim() || null,
        requestedByUserId: actor.id,
        requestedByName: await this.nameOf(actor.id),
      },
    });
  }

  async list(filter: { from?: Date; to?: Date; status?: ExpenseStatus }) {
    const client = await this.tenantPrisma.getClient();
    const expenses = await client.expense.findMany({
      where: {
        deletedAt: null,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.from || filter.to
          ? { incurredOn: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
          : {}),
      },
      orderBy: { incurredOn: "desc" },
    });

    // The summary is computed over what was asked for, so a filtered view
    // totals what is on screen rather than the whole year — a total that
    // disagrees with the rows above it is worse than no total.
    return { expenses, summary: summariseExpenses(expenses) };
  }

  async findOne(id: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const expense = await client.expense.findFirst({ where: { id, deletedAt: null } });
    if (!expense) throw new NotFoundException("No expense found with that id");

    return {
      ...expense,
      availableTransitions: availableTransitions(expense.status, {
        isAdmin: viewer.roles.includes("SCHOOL_ADMIN"),
        isRequester: expense.requestedByUserId === viewer.id,
      }),
    };
  }

  /** Editable only while nobody has decided on it. */
  async update(id: string, dto: UpdateExpenseDto, actor: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const expense = await client.expense.findFirst({ where: { id, deletedAt: null } });
    if (!expense) throw new NotFoundException("No expense found with that id");

    if (expense.status !== "REQUESTED" && expense.status !== "REJECTED") {
      throw new BadRequestException("This expense has been decided and can no longer be edited");
    }
    if (expense.requestedByUserId !== actor.id && !actor.roles.includes("SCHOOL_ADMIN")) {
      throw new ForbiddenException("Only the person who asked can edit this");
    }
    if (dto.amountCents !== undefined) {
      const problem = validateExpenseAmount(dto.amountCents);
      if (problem) throw new BadRequestException(problem);
    }

    return client.expense.update({
      where: { id },
      data: {
        category: dto.category?.trim(),
        description: dto.description?.trim(),
        amountCents: dto.amountCents,
        payee: dto.payee?.trim(),
        incurredOn: dto.incurredOn ? new Date(dto.incurredOn) : undefined,
      },
    });
  }

  /**
   * Approve, turn down, pay, or raise again.
   *
   * The decision is `checkTransition`, which knows that the person who asked
   * cannot be the person who signs it off. The database carries the same rule
   * as a CHECK, so a future route that forgets to come through here still
   * cannot write the row.
   */
  async decide(id: string, dto: DecideExpenseDto, actor: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const expense = await client.expense.findFirst({ where: { id, deletedAt: null } });
    if (!expense) throw new NotFoundException("No expense found with that id");

    const problem = checkTransition(expense.status, dto.to, {
      isAdmin: actor.roles.includes("SCHOOL_ADMIN"),
      isRequester: expense.requestedByUserId === actor.id,
    });
    if (problem) throw new ForbiddenException(problem);

    if (dto.to === "REJECTED" && !dto.note?.trim()) {
      // Turning down a request in silence leaves somebody to guess, and
      // guessing is how the same request comes back unchanged.
      throw new BadRequestException("Say why when you turn a request down");
    }

    const decidedByName = await this.nameOf(actor.id);

    return client.expense.update({
      where: { id },
      data: {
        status: dto.to,
        ...(dto.to === "APPROVED" || dto.to === "REJECTED"
          ? {
              decidedAt: new Date(),
              decidedByUserId: actor.id,
              decidedByName,
              decisionNote: dto.note?.trim() ?? null,
            }
          : {}),
        ...(dto.to === "PAID"
          ? { paidAt: new Date(), method: dto.method ?? null, reference: dto.reference ?? null }
          : {}),
        // Raising a rejected request again clears the old decision, so the
        // next approver is not looking at somebody else's "no".
        ...(dto.to === "REQUESTED"
          ? { decidedAt: null, decidedByUserId: null, decidedByName: null, decisionNote: null }
          : {}),
      },
    });
  }

  /**
   * Withdraw an expense.
   *
   * Never once it is paid. Money that has left cannot be un-spent by hiding
   * the row that says it did.
   */
  async remove(id: string, actor: AuthenticatedUser) {
    if (!actor.roles.includes("SCHOOL_ADMIN")) {
      throw new ForbiddenException("Only an administrator can withdraw an expense");
    }
    const client = await this.tenantPrisma.getClient();
    const expense = await client.expense.findFirst({ where: { id, deletedAt: null } });
    if (!expense) throw new NotFoundException("No expense found with that id");
    if (expense.status === "PAID") {
      throw new BadRequestException("An expense that has been paid cannot be withdrawn");
    }

    await client.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private async nameOf(userId: string): Promise<string> {
    const client = await this.tenantPrisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}`.trim() : "Unknown";
  }
}
