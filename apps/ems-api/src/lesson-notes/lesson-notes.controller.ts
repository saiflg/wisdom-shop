import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { LessonNotesService } from "./lesson-notes.service";
import { CreateLessonNoteDto } from "./dto/create-lesson-note.dto";
import { UpdateLessonNoteDto } from "./dto/update-lesson-note.dto";
import { TransitionLessonNoteDto } from "./dto/transition-lesson-note.dto";
import type { LessonNoteStatus } from "./note-workflow";

@ApiTags("lesson-notes")
@ApiBearerAuth()
@Controller("lesson-notes")
export class LessonNotesController {
  constructor(private readonly notes: LessonNotesService) {}

  @Post()
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Start a lesson note" })
  create(@Body() dto: CreateLessonNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.notes.create(dto, user);
  }

  // Widened deliberately: reading the week's notes is what a child is here
  // for. LessonNotesService.list forces status=APPROVED for anyone who is
  // not staff, after their own filter rather than before it, so the query
  // string cannot widen what a child sees.
  @Get()
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @ApiQuery({ name: "classId", required: false })
  @ApiQuery({ name: "subjectId", required: false })
  @ApiQuery({ name: "status", required: false })
  @ApiOperation({
    summary: "Lesson notes; children see approved ones only",
    description: "The status filter can narrow what a family sees, never widen it.",
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("classId") classId?: string,
    @Query("subjectId") subjectId?: string,
    @Query("status") status?: LessonNoteStatus,
  ) {
    return this.notes.list(user, { classId, subjectId, status });
  }

  @Get(":id")
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @ApiOperation({
    summary: "One note, with the moves this viewer can make on it",
    description: "An unapproved note is a 404 for a child, not a 403.",
  })
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notes.findOne(id, user);
  }

  @Patch(":id")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Edit a note, while it is a draft or has been returned" })
  update(@Param("id") id: string, @Body() dto: UpdateLessonNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.notes.update(id, dto, user);
  }

  // Staff-only at the door, but the real decision is checkTransition in the
  // service — including the rule that nobody approves their own note, which
  // a role decorator cannot express.
  @Patch(":id/status")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Send for vetting, approve, or send back",
    description: "Nobody can approve or return a note they wrote themselves, administrator or not.",
  })
  transition(
    @Param("id") id: string,
    @Body() dto: TransitionLessonNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notes.transition(id, dto, user);
  }

  @Delete(":id")
  @Roles("SCHOOL_ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Withdraw a note. Soft-delete; the week is free to be written again." })
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notes.remove(id, user);
  }
}
