import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { SchemesOfWorkService } from "./schemes-of-work.service";
import { CreateSchemeOfWorkDto } from "./dto/create-scheme-of-work.dto";
import { GenerateSchemeOfWorkDto } from "./dto/generate-scheme-of-work.dto";
import { UpdateSchemeOfWorkDto } from "./dto/update-scheme-of-work.dto";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";

@ApiTags("schemes-of-work")
@ApiBearerAuth()
@Controller("schemes-of-work")
export class SchemesOfWorkController {
  constructor(private readonly schemesOfWork: SchemesOfWorkService) {}

  @Post()
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Manually create a scheme of work" })
  create(@Body() dto: CreateSchemeOfWorkDto, @CurrentUser() user: AuthenticatedUser) {
    return this.schemesOfWork.create(dto, user);
  }

  @Post("generate")
  @RequiresModule("AI_CURRICULUM")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Generate a scheme of work with AI — 403 if the school's mode is MANUAL" })
  generate(@Body() dto: GenerateSchemeOfWorkDto, @CurrentUser() user: AuthenticatedUser) {
    return this.schemesOfWork.generate(dto, user);
  }

  @Get()
  @ApiOperation({ summary: "List schemes of work — students/guardians see only published ones" })
  list(@CurrentUser() user: AuthenticatedUser, @Query("subjectId") subjectId?: string) {
    return this.schemesOfWork.list(user, subjectId);
  }

  @Get(":id")
  @ApiOperation({ summary: "A scheme of work's detail" })
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.schemesOfWork.findOne(id, user);
  }

  @Patch(":id")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Edit a scheme of work's content" })
  update(@Param("id") id: string, @Body() dto: UpdateSchemeOfWorkDto) {
    return this.schemesOfWork.update(id, dto);
  }

  @Patch(":id/publish")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Publish a scheme of work" })
  publish(@Param("id") id: string) {
    return this.schemesOfWork.publish(id);
  }
}
