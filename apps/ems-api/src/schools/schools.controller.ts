import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "@/auth/decorators/public.decorator";
import { PlatformJwtAuthGuard } from "@/platform-auth/guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "@/platform-auth/guards/platform-roles.guard";
import { PlatformRoles } from "@/platform-auth/decorators/platform-roles.decorator";
import { CurrentPlatformUser } from "@/platform-auth/decorators/current-platform-user.decorator";
import type { AuthenticatedPlatformUser } from "@/platform-auth/interfaces/platform-jwt-payload.interface";
import { SchoolsService } from "./schools.service";
import { CreateSchoolDto } from "./dto/create-school.dto";
import { ChangeSchoolStatusDto } from "./dto/change-school-status.dto";

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

  @Get(":id")
  @ApiOperation({ summary: "A school's detail, including its provisioning history" })
  findOne(@Param("id") id: string) {
    return this.schools.findOne(id);
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
