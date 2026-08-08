import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { AiTeacherService } from "./ai-teacher.service";
import { StartSessionDto } from "./dto/start-session.dto";
import { AskQuestionDto } from "./dto/ask-question.dto";

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

  @Patch(":id/end")
  @ApiOperation({ summary: "End a lesson" })
  end(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiTeacher.end(id, user);
  }
}
