import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { QuizzesService } from "./quizzes.service";
import { CreateQuizDto } from "./dto/create-quiz.dto";
import { GenerateQuizDto } from "./dto/generate-quiz.dto";
import { UpdateQuizDto } from "./dto/update-quiz.dto";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";

@ApiTags("quizzes")
@ApiBearerAuth()
@Controller("quizzes")
export class QuizzesController {
  constructor(private readonly quizzes: QuizzesService) {}

  @Post()
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Manually create a quiz for one week of a scheme of work" })
  create(@Body() dto: CreateQuizDto, @CurrentUser() user: AuthenticatedUser) {
    return this.quizzes.create(dto, user);
  }

  @Post("generate")
  @RequiresModule("AI_CURRICULUM")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Generate a quiz with AI — 403 if the school's mode is MANUAL" })
  generate(@Body() dto: GenerateQuizDto, @CurrentUser() user: AuthenticatedUser) {
    return this.quizzes.generate(dto, user);
  }

  @Get()
  @ApiOperation({ summary: "List quizzes — students/guardians see published ones without the answer key" })
  list(@CurrentUser() user: AuthenticatedUser, @Query("schemeOfWorkId") schemeOfWorkId?: string) {
    return this.quizzes.list(user, schemeOfWorkId);
  }

  @Get(":id")
  @ApiOperation({ summary: "A quiz's detail — answers omitted for students/guardians" })
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.quizzes.findOne(id, user);
  }

  @Patch(":id")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Edit a quiz's title or questions" })
  update(@Param("id") id: string, @Body() dto: UpdateQuizDto) {
    return this.quizzes.update(id, dto);
  }

  @Patch(":id/publish")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Publish a quiz" })
  publish(@Param("id") id: string) {
    return this.quizzes.publish(id);
  }
}
