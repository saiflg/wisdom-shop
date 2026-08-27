import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { WalletsService } from "./wallets.service";
import { RecordWalletEntryDto } from "./dto/record-wallet-entry.dto";

@ApiTags("wallets")
@ApiBearerAuth()
@Controller("wallets")
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  // Widened deliberately, like fees: a family reading their own child's
  // balance is most of what this is for. WalletsService.assertMayView
  // 404s for anybody asking after somebody else's child.
  @Get(":studentProfileId")
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @ApiOperation({
    summary: "A student's wallet balance",
    description: "A family asking after another child gets a 404, not a 403.",
  })
  wallet(@Param("studentProfileId") studentProfileId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.wallets.walletFor(studentProfileId, user);
  }

  @Get(":studentProfileId/statement")
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @ApiOperation({ summary: "What has moved, newest first" })
  statement(
    @Param("studentProfileId") studentProfileId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query("take") take?: string,
  ) {
    return this.wallets.statement(studentProfileId, user, take ? Number(take) : undefined);
  }

  @Post(":studentProfileId/entries")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Move money in or out",
    description:
      "The amount is always positive; the kind decides the direction. A reference that has been used before " +
      "returns the entry it made rather than moving money a second time.",
  })
  record(
    @Param("studentProfileId") studentProfileId: string,
    @Body() dto: RecordWalletEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.wallets.record(studentProfileId, dto, user);
  }

  @Get(":studentProfileId/reconcile")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Does the stored balance still match its entries?" })
  reconcile(@Param("studentProfileId") studentProfileId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.wallets.reconcile(studentProfileId, user);
  }
}
