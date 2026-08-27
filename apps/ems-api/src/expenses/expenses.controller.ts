import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { ExpensesService } from "./expenses.service";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { UpdateExpenseDto } from "./dto/update-expense.dto";
import { DecideExpenseDto } from "./dto/decide-expense.dto";
import type { ExpenseStatus } from "./expense-rules";

/**
 * Staff only, top to bottom. What a school spends is not a parent's business
 * through this console, and the class-level @Roles says so once rather than
 * five times.
 */
@ApiTags("expenses")
@ApiBearerAuth()
@Controller("expenses")
@Roles("SCHOOL_ADMIN", "TEACHER")
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Post()
  @ApiOperation({ summary: "Ask for money" })
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.create(dto, user);
  }

  @Get()
  @ApiQuery({ name: "from", required: false })
  @ApiQuery({ name: "to", required: false })
  @ApiQuery({ name: "status", required: false })
  @ApiOperation({
    summary: "Expenses and what they add up to",
    description: "The summary totals the rows returned, so a filtered view does not disagree with itself.",
  })
  list(@Query("from") from?: string, @Query("to") to?: string, @Query("status") status?: ExpenseStatus) {
    return this.expenses.list({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      status,
    });
  }

  @Get(":id")
  @ApiOperation({ summary: "One expense, with the moves this viewer can make" })
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.findOne(id, user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Edit, while nobody has decided on it" })
  update(@Param("id") id: string, @Body() dto: UpdateExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.update(id, dto, user);
  }

  // The real check is checkTransition in the service — including that the
  // person who asked cannot sign it off, which a role decorator cannot say.
  @Patch(":id/status")
  @ApiOperation({
    summary: "Approve, turn down, pay, or ask again",
    description: "Nobody can approve spending they asked for themselves, administrator or not.",
  })
  decide(@Param("id") id: string, @Body() dto: DecideExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.decide(id, dto, user);
  }

  @Delete(":id")
  @Roles("SCHOOL_ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Withdraw an expense. Never once it has been paid." })
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.remove(id, user);
  }
}
