import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags, ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { RoleName } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { UsersService } from "./users.service";
import { STRONG_PASSWORD_REGEX } from "../auth/dto/register.dto";
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

class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // The same strength rule as public registration. An account an admin
  // created is not a weaker account.
  @ApiProperty({ description: "Min 10 chars, upper/lower/number/symbol" })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_REGEX, {
    message: "password must include an uppercase letter, lowercase letter, number, and symbol",
  })
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional({ enum: RoleName, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(RoleName, { each: true })
  roles?: RoleName[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  markEmailVerified?: boolean = true;
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

  @Post()
  @ApiOperation({
    summary: "Create a user",
    description:
      "Roles go through the same escalation policy as granting a role to an existing user — creating an account is not a way around it.",
  })
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.users.createUser(actor.id, actor.roles as RoleName[], dto);
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
