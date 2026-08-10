import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { HomeworkService } from "./homework.service";
import {
  CreateAssignmentDto,
  MarkSubmissionDto,
  SubmitWorkDto,
  UpdateAssignmentDto,
} from "./dto/homework.dto";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";

/**
 * Homework: a teacher sets work, students hand it in, it is marked.
 *
 * Reads are open to every role and scoped in the service — a student sees
 * their own class's work and their own submission, a guardian their
 * children's, staff everything. Writes are split: only staff set and mark,
 * only a student hands in, and the student is taken from the token rather
 * than a parameter so there is nothing to tamper with.
 */
@ApiTags("homework")
@ApiBearerAuth()
@RequiresModule("HOMEWORK")
@Controller("homework")
export class HomeworkController {
  constructor(private readonly homework: HomeworkService) {}

  @Post()
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Set a piece of work" })
  create(@Body() dto: CreateAssignmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.homework.create(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: "List work",
    description: "Students and guardians see only work set for their own classes, never a draft.",
  })
  list(@CurrentUser() user: AuthenticatedUser, @Query("classId") classId?: string) {
    return this.homework.list(user, classId);
  }

  @Get(":id")
  @ApiOperation({
    summary: "One assignment",
    description: "Staff also get every submission and a progress summary; a family gets only their own.",
  })
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.homework.findOne(id, user);
  }

  @Patch(":id")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Edit a piece of work, or set and close it" })
  update(@Param("id") id: string, @Body() dto: UpdateAssignmentDto) {
    return this.homework.update(id, dto);
  }

  @Post(":id/submit")
  @ApiOperation({
    summary: "Hand work in",
    description:
      "Late work is accepted and flagged rather than refused. Handing in again replaces what is there, " +
      "until it has been marked.",
  })
  submit(@Param("id") id: string, @Body() dto: SubmitWorkDto, @CurrentUser() user: AuthenticatedUser) {
    return this.homework.submit(id, dto, user);
  }

  @Patch("submissions/:id/mark")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Mark one submission",
    description: "Held back from the student until released, so a class can be marked over an evening.",
  })
  mark(@Param("id") id: string, @Body() dto: MarkSubmissionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.homework.mark(id, dto, user);
  }

  @Post(":id/release")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Release every marked submission for this work",
    description: "Also writes the marks through to the linked assessment, if there is one.",
  })
  release(@Param("id") id: string) {
    return this.homework.release(id);
  }
}
