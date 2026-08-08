import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import { Roles } from "@/auth/decorators/roles.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { AiTeacherService } from "./ai-teacher.service";
import { LessonResourcesService } from "./lesson-resources.service";
import { StartSessionDto } from "./dto/start-session.dto";
import { AskQuestionDto } from "./dto/ask-question.dto";
import { CreateLessonResourceDto } from "./dto/create-lesson-resource.dto";

/**
 * The AI Teacher: a tutoring conversation grounded in the school's own
 * curriculum.
 *
 * Deliberately not `@Roles`-gated as a whole. Students are the primary users,
 * staff may hold their own lessons to see what the tutor tells their class,
 * and guardians get read-only access to their own children's transcripts —
 * the distinctions live in the service, which has the data to enforce them.
 */
@ApiTags("ai-teacher")
@ApiBearerAuth()
@Controller("ai-teacher/sessions")
export class AiTeacherController {
  constructor(private readonly aiTeacher: AiTeacherService) {}

  @Post()
  @ApiOperation({ summary: "Start a lesson on a subject and topic" })
  start(@Body() dto: StartSessionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.aiTeacher.start(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: "List lessons",
    description: "Staff see the school's lessons, guardians their children's, students their own.",
  })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.aiTeacher.list(user);
  }

  @Get(":id")
  @ApiOperation({ summary: "One lesson with its full transcript" })
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiTeacher.findOne(id, user);
  }

  @Post(":id/ask")
  @ApiOperation({
    summary: "Ask the tutor a question",
    description:
      "Only the student whose lesson it is may ask. Refused without calling the provider once the " +
      "per-session or daily limit is reached.",
  })
  ask(@Param("id") id: string, @Body() dto: AskQuestionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.aiTeacher.ask(id, dto, user);
  }

  @Post(":id/continue")
  @ApiOperation({
    summary: "Teach the next lesson of an automatic class",
    description:
      "Advances only after the lesson is stored, so an interrupted request re-teaches a lesson rather than " +
      "skipping one. Resuming a paused class is implicit.",
  })
  continueClass(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiTeacher.continueClass(id, user);
  }

  @Patch(":id/pause")
  @ApiOperation({ summary: "Put a class down without ending it" })
  pause(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiTeacher.pause(id, user);
  }

  @Patch(":id/resume")
  @ApiOperation({ summary: "Pick a paused class back up at the lesson it stopped on" })
  resume(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiTeacher.resume(id, user);
  }

  @Patch(":id/end")
  @ApiOperation({ summary: "End a lesson" })
  end(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiTeacher.end(id, user);
  }
}

/**
 * The school's library of demonstrations, offered to students mid-class.
 *
 * Staff-only to write, readable by anyone who can take a class. Nothing here
 * is ever suggested by the AI — see match-resources.ts.
 */
@ApiTags("ai-teacher")
@ApiBearerAuth()
@Controller("ai-teacher/resources")
export class LessonResourcesController {
  constructor(private readonly resources: LessonResourcesService) {}

  @Post()
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Add a demonstration a student can watch during a lesson" })
  create(@Body() dto: CreateLessonResourceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.resources.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: "The school's demonstrations, optionally for one subject" })
  list(@Query("subjectId") subjectId?: string) {
    return this.resources.list(subjectId);
  }

  @Delete(":id")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Withdraw a demonstration" })
  remove(@Param("id") id: string) {
    return this.resources.remove(id);
  }
}
