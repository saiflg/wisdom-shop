import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { AttendanceService } from "./attendance.service";
import { AmendAttendanceDto, TakeRegisterDto } from "./dto/attendance.dto";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";

@ApiTags("attendance")
@ApiBearerAuth()
@RequiresModule("ATTENDANCE")
@Controller("attendance")
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post("registers")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Take a register for a class on a date",
    description:
      "Only actively-enrolled students may be marked. Re-submitting fills in missing marks but never overwrites " +
      "an existing one — changing a recorded mark is an amendment and requires a reason.",
  })
  takeRegister(@Body() dto: TakeRegisterDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.takeRegister(dto, user);
  }

  @Get("registers/:id")
  @ApiOperation({ summary: "A register — students and guardians see only their own rows" })
  getRegister(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.getRegister(id, user);
  }

  @Get("classes/:classId/registers")
  @ApiOperation({ summary: "A class's register history (staff only)" })
  listForClass(@Param("classId") classId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.listForClass(classId, user);
  }

  @Get("students/:studentProfileId")
  @ApiOperation({
    summary: "A student's attendance history and summary",
    description: "A guardian may only read students they are linked to; anyone else gets a 404.",
  })
  forStudent(@Param("studentProfileId") studentProfileId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.forStudent(studentProfileId, user);
  }

  @Patch("records/:id")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Correct a recorded mark",
    description: "Records who changed it and why, in the same transaction as the change.",
  })
  amend(@Param("id") id: string, @Body() dto: AmendAttendanceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.amend(id, dto, user);
  }
}
