import { Controller, Get, Param } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { StaffOverviewService } from "./staff-overview.service";

@ApiTags("staff-overview")
@ApiBearerAuth()
@Controller("staff-overview")
export class StaffOverviewController {
  constructor(private readonly overview: StaffOverviewService) {}

  // Staff only, and narrowed again in the service: anybody may read their
  // own, only an administrator may read somebody else's. Stricter than the
  // student equivalent because this is close enough to an employment record
  // to be treated as one.
  @Get(":userId")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Where one member of staff stands",
    description:
      "Attendance, leave, teaching load and lesson notes. Figures the school has no basis for come back " +
      "null rather than zero — a teacher with no timetable entered is not a teacher with nothing to do.",
  })
  forStaff(@Param("userId") userId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.overview.forStaff(userId, user);
  }
}
