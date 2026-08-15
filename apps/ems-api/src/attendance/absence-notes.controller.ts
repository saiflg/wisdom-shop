import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";
import { AbsenceNotesService } from "./absence-notes.service";
import { CreateAbsenceNoteDto } from "./dto/absence-note.dto";

/**
 * A parent telling the school their child will be away.
 *
 * Guardians write them; staff read them and act. Nothing here writes an
 * attendance mark — a note is evidence put in front of whoever takes the
 * register, and they decide.
 */
@ApiTags("absence-notes")
@ApiBearerAuth()
@RequiresModule("ATTENDANCE")
@Controller("absence-notes")
export class AbsenceNotesController {
  constructor(private readonly notes: AbsenceNotesService) {}

  @Get("pending")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Notes nobody has dealt with yet",
    description: "Soonest first: a note about this morning matters more than one written first about next month.",
  })
  pending(@CurrentUser() user: AuthenticatedUser) {
    return this.notes.pending(user);
  }

  @Get("register")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Which of these children have a note covering this day",
    description:
      "Returns a short hint per child and never the parent's free text — a teacher needs to know an absence " +
      "is explained, not what a child's symptoms are on a screen in front of a classroom.",
  })
  forRegister(
    @Query("studentProfileIds") studentProfileIds: string,
    @Query("date") date: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const ids = (studentProfileIds ?? "").split(",").filter(Boolean);
    return this.notes.forRegister(ids, date ? new Date(date) : new Date(), user);
  }

  @Get(":studentProfileId")
  @Roles("SCHOOL_ADMIN", "TEACHER", "GUARDIAN")
  @ApiOperation({
    summary: "Absence notes for one child",
    description: "A guardian asking about a child who is not theirs gets a 404, never a 403.",
  })
  forStudent(@Param("studentProfileId") studentProfileId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notes.forStudent(studentProfileId, user);
  }

  @Post()
  @Roles("SCHOOL_ADMIN", "TEACHER", "GUARDIAN")
  @ApiOperation({
    summary: "Tell the school a child will be away",
    description:
      "Staff may write one too, so a parent who telephones the office does not have to use the portal as well.",
  })
  create(@Body() dto: CreateAbsenceNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.notes.create(dto, user);
  }

  @Patch(":id/withdraw")
  @Roles("SCHOOL_ADMIN", "TEACHER", "GUARDIAN")
  @ApiOperation({
    summary: "Take a note back",
    description:
      "Only the person who sent it, and only before the school has acknowledged it. Withdrawn rather than " +
      "deleted: the school may have acted on it in the meantime.",
  })
  withdraw(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notes.withdraw(id, user);
  }

  @Patch(":id/acknowledge")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Record that the school has seen and dealt with a note" })
  acknowledge(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notes.acknowledge(id, user);
  }
}
