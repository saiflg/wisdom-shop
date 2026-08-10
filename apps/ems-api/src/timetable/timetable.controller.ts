import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { TimetableService } from "./timetable.service";
import {
  GenerateTimetableDto,
  ReplacePeriodsDto,
  TimetableSettingsDto,
  UpsertAssignmentDto,
  UpsertEntryDto,
} from "./dto/timetable.dto";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";

@ApiTags("timetable")
@ApiBearerAuth()
@RequiresModule("TIMETABLE")
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

  @Get("settings")
  @ApiOperation({ summary: "The shape of the school day" })
  getSettings() {
    return this.timetable.getSettings();
  }

  @Put("settings")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Set the school day, and optionally rebuild the periods from it",
    description:
      "Without applyToPeriods this only previews what the day would look like. Rebuilding clears every " +
      "scheduled lesson, because the periods they were placed against no longer exist.",
  })
  updateSettings(@Body() dto: TimetableSettingsDto) {
    return this.timetable.updateSettings(dto);
  }

  @Get("assignments")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "What each class is taught, by whom, and how often" })
  listAssignments() {
    return this.timetable.listAssignments();
  }

  @Put("assignments")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Record that a class takes a subject for so many periods a week" })
  upsertAssignment(@Body() dto: UpsertAssignmentDto) {
    return this.timetable.upsertAssignment(dto);
  }

  @Delete("assignments/:id")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Stop scheduling a subject for a class" })
  deleteAssignment(@Param("id") id: string) {
    return this.timetable.deleteAssignment(id);
  }

  @Post("generate")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Build the whole week automatically",
    description:
      "Preview unless commit is true, because generating replaces every lesson in the school. Never places " +
      "a class or a teacher in two lessons at once, and reports anything it could not fit rather than " +
      "quietly dropping it.",
  })
  generate(@Body() dto: GenerateTimetableDto) {
    return this.timetable.generate(dto);
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
