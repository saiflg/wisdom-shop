import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { LessonPlansService } from "./lesson-plans.service";
import { CreateLessonPlanDto } from "./dto/create-lesson-plan.dto";
import { GenerateLessonPlanDto } from "./dto/generate-lesson-plan.dto";
import { UpdateLessonPlanDto } from "./dto/update-lesson-plan.dto";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";

@ApiTags("lesson-plans")
@ApiBearerAuth()
@Controller("lesson-plans")
export class LessonPlansController {
  constructor(private readonly lessonPlans: LessonPlansService) {}

  @Post()
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Manually create a lesson plan for one week of a scheme of work" })
  create(@Body() dto: CreateLessonPlanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.lessonPlans.create(dto, user);
  }

  @Post("generate")
  @RequiresModule("AI_CURRICULUM")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Generate a lesson plan with AI — 403 if the school's mode is MANUAL" })
  generate(@Body() dto: GenerateLessonPlanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.lessonPlans.generate(dto, user);
  }

  @Get()
  @ApiOperation({ summary: "List lesson plans — students/guardians see only published ones" })
  list(@CurrentUser() user: AuthenticatedUser, @Query("schemeOfWorkId") schemeOfWorkId?: string) {
    return this.lessonPlans.list(user, schemeOfWorkId);
  }

  @Get(":id")
  @ApiOperation({ summary: "A lesson plan's detail" })
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lessonPlans.findOne(id, user);
  }

  @Patch(":id")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Edit a lesson plan's content" })
  update(@Param("id") id: string, @Body() dto: UpdateLessonPlanDto) {
    return this.lessonPlans.update(id, dto);
  }

  @Patch(":id/publish")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Publish a lesson plan" })
  publish(@Param("id") id: string) {
    return this.lessonPlans.publish(id);
  }
}
