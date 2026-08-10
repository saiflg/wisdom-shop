import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "@/auth/decorators/public.decorator";
import { PlatformJwtAuthGuard } from "@/platform-auth/guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "@/platform-auth/guards/platform-roles.guard";
import { PlatformRoles } from "@/platform-auth/decorators/platform-roles.decorator";
import { CurrentPlatformUser } from "@/platform-auth/decorators/current-platform-user.decorator";
import type { AuthenticatedPlatformUser } from "@/platform-auth/interfaces/platform-jwt-payload.interface";
import { SchoolsService } from "./schools.service";
import { MODULE_CATALOG } from "./school-modules";
import { CreateSchoolDto } from "./dto/create-school.dto";
import { ChangeSchoolStatusDto } from "./dto/change-school-status.dto";
import { SetSchoolModulesDto, UpdateSchoolDto } from "./dto/update-school.dto";

@ApiTags("platform-schools")
@ApiBearerAuth()
@Public()
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
@PlatformRoles("PLATFORM_ADMIN")
@Controller("platform/schools")
export class SchoolsController {
  constructor(private readonly schools: SchoolsService) {}

  @Post()
  @ApiOperation({ summary: "Onboard a new school: creates its database, applies migrations, seeds its first admin" })
  create(@Body() dto: CreateSchoolDto) {
    return this.schools.create(dto);
  }

  @Get()
  @ApiOperation({ summary: "List all schools" })
  list() {
    return this.schools.list();
  }

  // Before `:id`, or "modules" is read as a school id and every catalog
  // request becomes a 404 for a school called "modules".
  @Get("modules/catalog")
  @ApiOperation({
    summary: "Every module a school can be given, with what each one is for",
    description: "Served from the code rather than a table: the catalog is a property of this build, not data.",
  })
  catalog() {
    return MODULE_CATALOG;
  }

  @Get(":id")
  @ApiOperation({ summary: "A school's detail, including its provisioning history" })
  findOne(@Param("id") id: string) {
    return this.schools.findOne(id);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Edit a school's name or custom domain",
    description:
      "The slug is not editable: it seeded the database name, it is the school's subdomain, and it is what users type at login.",
  })
  update(@Param("id") id: string, @Body() dto: UpdateSchoolDto) {
    return this.schools.update(id, dto);
  }

  @Put(":id/modules")
  @ApiOperation({
    summary: "Switch modules on or off for one school",
    description:
      "Stores only the differences from the plan, so a later plan upgrade still reaches this school. Every change is recorded with its reason.",
  })
  setModules(
    @Param("id") id: string,
    @Body() dto: SetSchoolModulesDto,
    @CurrentPlatformUser() actor: AuthenticatedPlatformUser,
  ) {
    return this.schools.setModules(id, dto, actor);
  }

  @Post(":id/retry-provisioning")
  @ApiOperation({
    summary: "Re-run onboarding for a school stuck in PROVISIONING/FAILED",
    description: "CREATE DATABASE and migrate deploy are both naturally idempotent, so this is safe to call repeatedly.",
  })
  retry(@Param("id") id: string, @Body() dto: CreateSchoolDto) {
    return this.schools.retryProvisioning(id, dto);
  }

  @Patch(":id/suspend")
  @ApiOperation({
    summary: "Suspend a school — its users are locked out immediately",
    description: "Records who suspended it and why. Takes effect at once rather than waiting out the tenant cache TTL.",
  })
  suspend(
    @Param("id") id: string,
    @Body() dto: ChangeSchoolStatusDto,
    @CurrentPlatformUser() actor: AuthenticatedPlatformUser,
  ) {
    return this.schools.suspend(id, dto.reason, actor);
  }

  @Patch(":id/reactivate")
  @ApiOperation({ summary: "Return a suspended school to service" })
  reactivate(
    @Param("id") id: string,
    @Body() dto: ChangeSchoolStatusDto,
    @CurrentPlatformUser() actor: AuthenticatedPlatformUser,
  ) {
    return this.schools.reactivate(id, dto.reason, actor);
  }
}
