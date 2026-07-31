import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags, ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { RoleName } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { UsersService } from "./users.service";
import type { AuthenticatedUser } from "../auth/interfaces/jwt-payload.interface";

class QueryUsersDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: "Matches email, first or last name" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: RoleName })
  @IsOptional()
  @IsEnum(RoleName)
  role?: RoleName;
}

class GrantRoleDto {
  @ApiProperty({ enum: RoleName })
  @IsEnum(RoleName)
  role!: RoleName;
}

@ApiTags("admin/users")
@ApiBearerAuth()
@Roles("ADMIN", "SUPER_ADMIN")
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: "List users, filterable by role and searchable by name or email" })
  list(@Query() query: QueryUsersDto) {
    return this.users.list(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.users.findById(id);
  }

  @Post(":id/roles")
  @ApiOperation({
    summary: "Grant a role",
    description:
      "Privileged roles (ADMIN, SUPER_ADMIN, DEVELOPER) require SUPER_ADMIN. VENDOR cannot be granted here — it follows vendor approval.",
  })
  grant(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: GrantRoleDto,
  ) {
    return this.users.grantRole(actor.id, actor.roles, id, dto.role);
  }

  @Delete(":id/roles/:role")
  @ApiOperation({
    summary: "Revoke a role",
    description:
      "Refuses if it would remove your own last administrative role, to avoid locking yourself out.",
  })
  revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Param("role") role: RoleName,
  ) {
    return this.users.revokeRole(actor.id, actor.roles, id, role);
  }
}
