import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { AccountingService } from "./accounting.service";

@ApiTags("accounting")
@ApiBearerAuth()
@Controller("accounting")
@Roles("SCHOOL_ADMIN")
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Get("statement")
  @ApiQuery({ name: "from", required: true })
  @ApiQuery({ name: "to", required: true })
  @ApiOperation({
    summary: "What money did over a period",
    description:
      "Not double-entry bookkeeping: no chart of accounts, no journal, no trial balance. It adds up what " +
      "the school recorded, and lists what it does not include.",
  })
  statement(@Query("from") from: string, @Query("to") to: string) {
    return this.accounting.statement(new Date(from), new Date(to));
  }
}
