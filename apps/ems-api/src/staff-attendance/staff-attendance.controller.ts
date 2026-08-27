import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { StaffAttendanceService } from "./staff-attendance.service";
import { MarkStaffAttendanceDto } from "./dto/mark-staff-attendance.dto";

@ApiTags("staff-attendance")
@ApiBearerAuth()
@Controller("staff-attendance")
export class StaffAttendanceController {
  constructor(private readonly attendance: StaffAttendanceService) {}

  @Post()
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Mark one member of staff for one day",
    description:
      "An absence that falls inside approved leave is recorded as on leave, and the response says so. " +
      "Marking the same person and day twice corrects the mark rather than adding a second one.",
  })
  mark(@Body() dto: MarkStaffAttendanceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.mark(dto, user);
  }

  @Get("day")
  @Roles("SCHOOL_ADMIN")
  @ApiQuery({ name: "date", required: true })
  @ApiOperation({ summary: "Everyone's marks for one day" })
  forDay(@Query("date") date: string) {
    return this.attendance.forDay(new Date(date));
  }

  // Widened to staff so a teacher can read their own record — the service
  // refuses anybody else's unless the viewer is an administrator. Attendance
  // feeds pay, and somebody is entitled to see what is recorded about them.
  @Get("staff")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiQuery({ name: "userId", required: true })
  @ApiQuery({ name: "from", required: true })
  @ApiQuery({ name: "to", required: true })
  @ApiOperation({
    summary: "One person over a period, with a summary",
    description: "Anybody may read their own; only an administrator may read somebody else's.",
  })
  forStaff(
    @Query("userId") userId: string,
    @Query("from") from: string,
    @Query("to") to: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendance.forStaff(userId, new Date(from), new Date(to), user);
  }
}
