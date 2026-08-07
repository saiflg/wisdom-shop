import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { TimetableService } from "./timetable.service";
import { ReplacePeriodsDto, UpsertEntryDto } from "./dto/timetable.dto";

@ApiTags("timetable")
@ApiBearerAuth()
@Controller("timetable")
export class TimetableController {
  constructor(private readonly timetable: TimetableService) {}

  @Get("periods")
  @ApiOperation({ summary: "The school's period structure" })
  listPeriods() {
    return this.timetable.listPeriods();
  }

  @Put("periods")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Replace the period structure",
    description:
      "Sent as a whole day, because 'no two periods overlap' is a property of the set. Periods sent with an " +
      "id are kept along with the lessons already scheduled against them.",
  })
  replacePeriods(@Body() dto: ReplacePeriodsDto) {
    return this.timetable.replacePeriods(dto);
  }

  @Post("entries")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Schedule a lesson",
    description:
      "Refused with a 409 naming the conflict if it would put a class in two lessons or a teacher in two " +
      "rooms at once.",
  })
  createEntry(@Body() dto: UpsertEntryDto) {
    return this.timetable.upsertEntry(dto);
  }

  @Put("entries/:id")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Move or restaff a lesson" })
  updateEntry(@Param("id") id: string, @Body() dto: UpsertEntryDto) {
    return this.timetable.upsertEntry(dto, id);
  }

  @Delete("entries/:id")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Remove a lesson from the timetable" })
  deleteEntry(@Param("id") id: string) {
    return this.timetable.deleteEntry(id);
  }

  @Get("classes/:classId")
  @ApiOperation({
    summary: "A class's week",
    description: "Families may read the timetable of a class their child is in, and get a 404 for any other.",
  })
  classTimetable(@Param("classId") classId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.timetable.classTimetable(classId, user);
  }

  @Get("teachers/:teacherUserId")
  @ApiOperation({ summary: "A teacher's week (staff only)" })
  teacherTimetable(@Param("teacherUserId") teacherUserId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.timetable.teacherTimetable(teacherUserId, user);
  }
}
