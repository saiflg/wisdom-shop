import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { StaffService } from "./staff.service";
import { RegisterStaffDto, RevealAccountNumberDto, UpsertStaffProfileDto } from "./dto/staff.dto";

@ApiTags("staff")
@ApiBearerAuth()
@Controller("staff")
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Staff with their employment records",
    description: "Bank details are always masked here. There is no flag to unmask them on this route.",
  })
  list() {
    return this.staff.list();
  }

  @Post()
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Register a staff member: a login plus their employment record",
    description:
      "Teaching or non-teaching. Bank details are not accepted here — they are entered on the staff record, " +
      "where the masking and the audited reveal sit beside the field.",
  })
  register(@Body() dto: RegisterStaffDto) {
    return this.staff.register(dto);
  }

  @Get("access-log")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Who has looked at whose full bank details, and why" })
  accessLog() {
    return this.staff.accessLog();
  }

  @Get(":userId")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "One staff member, bank details masked" })
  findOne(@Param("userId") userId: string) {
    return this.staff.findOne(userId);
  }

  @Put(":userId")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Create or update a staff employment record",
    description:
      "The account number is encrypted on the way in and never echoed back. Send an empty string to clear " +
      "it; omit the field to leave it unchanged.",
  })
  upsert(@Param("userId") userId: string, @Body() dto: UpsertStaffProfileDto) {
    return this.staff.upsert(userId, dto);
  }

  @Post(":userId/account-number")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Reveal a full account number for payroll",
    description:
      "Requires a reason, which is written to the access log before the number is returned. A POST rather " +
      "than a GET because this has a side effect and must never be cached or prefetched.",
  })
  reveal(
    @Param("userId") userId: string,
    @Body() dto: RevealAccountNumberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staff.revealAccountNumber(userId, dto, user);
  }
}
