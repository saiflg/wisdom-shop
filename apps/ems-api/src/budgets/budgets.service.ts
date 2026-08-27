import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { summariseExpenses } from "@/expenses/expense-rules";
import type { CreateBudgetDto } from "./dto/create-budget.dto";
import type { UpdateBudgetDto } from "./dto/update-budget.dto";
import { compareToActual, validateBudgetLines, validatePeriod } from "./budget-rules";

@Injectable()
export class BudgetsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateBudgetDto, actor: AuthenticatedUser) {
    const from = new Date(dto.fromDate);
    const to = new Date(dto.toDate);

    const periodProblem = validatePeriod(from, to);
    if (periodProblem) throw new BadRequestException(periodProblem);

    const lineProblem = validateBudgetLines(dto.lines);
    if (lineProblem) throw new BadRequestException(lineProblem);

    const client = await this.tenantPrisma.getClient();
    try {
      return await client.budget.create({
        data: {
          name: dto.name.trim(),
          academicYear: dto.academicYear,
          term: dto.term ?? null,
          fromDate: from,
          toDate: to,
          createdByUserId: actor.id,
          createdByName: await this.nameOf(actor.id),
          lines: {
            create: dto.lines.map((line) => ({
              category: line.category.trim(),
              amountCents: line.amountCents,
            })),
          },
        },
        include: { lines: true },
      });
    } catch (error) {
      // The lower-cased unique index catches a duplicate the validator would
      // only have seen within one request.
      if ((error as { code?: string }).code === "P2002") {
        throw new ConflictException("That budget has two lines for the same category");
      }
      throw error;
    }
  }

  async list() {
    const client = await this.tenantPrisma.getClient();
    return client.budget.findMany({
      where: { deletedAt: null },
      orderBy: { fromDate: "desc" },
      include: { lines: { orderBy: { category: "asc" } } },
    });
  }

  /**
   * A budget beside what was actually spent in its period.
   *
   * Spending comes from `summariseExpenses`, the same function the expenses
   * screen totals with, so the two screens cannot disagree about what a
   * category cost. Only committed money counts — a request nobody has
   * approved is somebody asking, not spending, and counting it here would
   * show a budget exhausted by requests that may yet be turned down.
   */
  async withActual(id: string) {
    const client = await this.tenantPrisma.getClient();
    const budget = await client.budget.findFirst({
      where: { id, deletedAt: null },
      include: { lines: true },
    });
    if (!budget) throw new NotFoundException("No budget found with that id");

    const expenses = await client.expense.findMany({
      where: {
        deletedAt: null,
        incurredOn: { gte: budget.fromDate, lte: budget.toDate },
      },
      select: { category: true, amountCents: true, status: true },
    });

    const spend = summariseExpenses(expenses).byCategory;
    return { budget, comparison: compareToActual(budget.lines, spend) };
  }

  /**
   * Update a budget, replacing its lines when new ones are given.
   *
   * Replaced wholesale rather than patched: the lines are read together as
   * one allowance, and a half-applied edit would be a budget nobody chose.
   */
  async update(id: string, dto: UpdateBudgetDto) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.budget.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("No budget found with that id");

    if (dto.lines) {
      const problem = validateBudgetLines(dto.lines);
      if (problem) throw new BadRequestException(problem);
    }

    const from = dto.fromDate ? new Date(dto.fromDate) : existing.fromDate;
    const to = dto.toDate ? new Date(dto.toDate) : existing.toDate;
    const periodProblem = validatePeriod(from, to);
    if (periodProblem) throw new BadRequestException(periodProblem);

    try {
      return await client.budget.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          academicYear: dto.academicYear,
          term: dto.term,
          fromDate: from,
          toDate: to,
          ...(dto.lines
            ? {
                lines: {
                  deleteMany: {},
                  create: dto.lines.map((line) => ({
                    category: line.category.trim(),
                    amountCents: line.amountCents,
                  })),
                },
              }
            : {}),
        },
        include: { lines: true },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        throw new ConflictException("That budget has two lines for the same category");
      }
      throw error;
    }
  }

  /**
   * Withdraw a budget.
   *
   * Soft-delete, and the expenses it was compared against are untouched. A
   * budget is a plan; deleting the plan must not disturb the record of what
   * was actually spent.
   */
  async remove(id: string) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.budget.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("No budget found with that id");
    await client.budget.update({ where: { id }, data: { deletedAt: new Date() } });
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
