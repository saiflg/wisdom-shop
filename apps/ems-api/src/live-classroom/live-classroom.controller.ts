import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { LiveClassroomService } from "./live-classroom.service";
import { CreateLiveLessonDto } from "./dto/create-live-lesson.dto";

@ApiTags("live-classroom")
@ApiBearerAuth()
@Controller("live-classroom")
export class LiveClassroomController {
  constructor(private readonly live: LiveClassroomService) {}

  @Post()
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Schedule a live lesson",
    description:
      "The link has to be https and from an allowed meeting host. This schedules a link to a meeting the " +
      "school runs elsewhere; it does not host video.",
  })
  schedule(@Body() dto: CreateLiveLessonDto, @CurrentUser() user: AuthenticatedUser) {
    return this.live.schedule(dto, user);
  }

  // Everybody signed in: attending a lesson is what this is for. The link
  // itself is withheld until the lesson is close enough to join.
  @Get()
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @ApiQuery({ name: "classId", required: true })
  @ApiOperation({
    summary: "Live lessons for a class",
    description:
      "The meeting link is null until fifteen minutes before the lesson, for anybody who is not staff.",
  })
  forClass(@Query("classId") classId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.live.forClass(classId, user);
  }

  @Post(":id/cancel")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Call a lesson off",
    description: "Cancelled, never deleted — a lesson that disappears is one somebody sits waiting for.",
  })
  cancel(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.live.cancel(id, user);
  }
}
