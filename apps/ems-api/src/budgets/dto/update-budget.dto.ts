import { PartialType } from "@nestjs/swagger";
import { CreateBudgetDto } from "./create-budget.dto";

/**
 * Omitting lines leaves them alone; sending them replaces the whole set,
 * because a budget is read as one allowance and a half-applied edit would be
 * a budget nobody chose.
 */
export class UpdateBudgetDto extends PartialType(CreateBudgetDto) {}
