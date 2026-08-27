import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { BudgetsService } from "./budgets.service";
import { CreateBudgetDto } from "./dto/create-budget.dto";
import { UpdateBudgetDto } from "./dto/update-budget.dto";

/**
 * Administrators only, top to bottom. What a school plans to spend is not
 * something a teacher needs through this console, and the class-level @Roles
 * says so once rather than five times.
 */
@ApiTags("budgets")
@ApiBearerAuth()
@Controller("budgets")
@Roles("SCHOOL_ADMIN")
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Post()
  @ApiOperation({ summary: "Set a budget" })
  create(@Body() dto: CreateBudgetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.budgets.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: "List budgets" })
  list() {
    return this.budgets.list();
  }

  @Get(":id")
  @ApiOperation({
    summary: "A budget beside what was actually spent",
    description:
      "Only committed spending counts. Money spent under a category nobody budgeted for gets its own row " +
      "rather than being quietly dropped.",
  })
  withActual(@Param("id") id: string) {
    return this.budgets.withActual(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a budget, replacing lines if given" })
  update(@Param("id") id: string, @Body() dto: UpdateBudgetDto) {
    return this.budgets.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Withdraw a budget. The expenses it was compared against are untouched." })
  remove(@Param("id") id: string) {
    return this.budgets.remove(id);
  }
}
