import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { WelfareService } from "./welfare.service";
import { CreateWelfareDto } from "./dto/create-welfare.dto";
import { DecideWelfareDto } from "./dto/decide-welfare.dto";
import type { WelfareStatus } from "./welfare-rules";

/**
 * Staff only, and narrowed again in the service: your own, or everything if
 * you are an administrator. No teacher ever sees another teacher's request.
 */
@ApiTags("welfare")
@ApiBearerAuth()
@Controller("welfare")
@Roles("SCHOOL_ADMIN", "TEACHER")
export class WelfareController {
  constructor(private readonly welfare: WelfareService) {}

  @Post()
  @ApiOperation({ summary: "Ask the school for help" })
  create(@Body() dto: CreateWelfareDto, @CurrentUser() user: AuthenticatedUser) {
    return this.welfare.create(dto, user);
  }

  @Get()
  @ApiQuery({ name: "status", required: false })
  @ApiOperation({
    summary: "Welfare requests you may read",
    description: "Your own, or all of them if you are an administrator. The filter cannot widen that.",
  })
  list(@CurrentUser() user: AuthenticatedUser, @Query("status") status?: WelfareStatus) {
    return this.welfare.list(user, status);
  }

  @Patch(":id/status")
  @ApiOperation({
    summary: "Approve, decline, pay, or ask again",
    description: "Nobody can decide a request they made themselves, administrator or not.",
  })
  decide(@Param("id") id: string, @Body() dto: DecideWelfareDto, @CurrentUser() user: AuthenticatedUser) {
    return this.welfare.decide(id, dto, user);
  }
}
