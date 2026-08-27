import { PartialType } from "@nestjs/swagger";
import { CreateExpenseDto } from "./create-expense.dto";

/** Editable only while nobody has decided on it — see the service. */
export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}
