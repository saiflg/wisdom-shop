import { Body, Controller, Get, Param, Patch, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { GuardianInvitationsService } from "@/guardians/guardian-invitations.service";
import { StaffService } from "./staff.service";
import { LeaveService } from "./leave.service";
import { RegisterStaffDto, RevealAccountNumberDto, UpsertStaffProfileDto } from "./dto/staff.dto";
import { DecideLeaveDto, RequestLeaveDto, SetEntitlementDto } from "./dto/leave.dto";

@ApiTags("staff")
@ApiBearerAuth()
@Controller("staff")
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly invitations: GuardianInvitationsService,
    private readonly leave: LeaveService,
  ) {}

  @Get("leave")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "What needs a decision, and who is away soon",
    description: "The two questions an office has about leave, on one screen.",
  })
  leaveOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.leave.overview(user);
  }

  @Post("leave")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Ask for time off",
    description:
      "Weekends are not counted. An administrator may record one for somebody who telephoned in, but it is " +
      "still not theirs to approve.",
  })
  requestLeave(@Body() dto: RequestLeaveDto, @CurrentUser() user: AuthenticatedUser) {
    return this.leave.request(dto, user);
  }

  @Patch("leave/:id/decide")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Approve or decline a request",
    description: "Refused if it is your own: an administrator asking for a fortnight is asking somebody else.",
  })
  decideLeave(
    @Param("id") id: string,
    @Body() dto: DecideLeaveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leave.decide(id, dto.approve, dto.note, user);
  }

  @Patch("leave/:id/cancel")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Take back your own request, before it starts" })
  cancelLeave(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.leave.cancel(id, user);
  }

  @Get(":userId/leave")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "One person's leave, and what is left of their allowance",
    description: "Your own, or anybody's if you are an administrator. A teacher has no business in a colleague's.",
  })
  staffLeave(@Param("userId") userId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.leave.forStaff(userId, user);
  }

  @Put(":userId/leave-entitlement")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Set an annual allowance. Zero means the school is not tracking it." })
  setEntitlement(
    @Param("userId") userId: string,
    @Body() dto: SetEntitlementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leave.setEntitlement(userId, dto.days, user);
  }


  /**
   * Invite a member of staff to set up their own password.
   *
   * The same mechanism parents use, and for the same reason: an
   * administrator who types a colleague's password knows how to sign in as
   * them — and a teacher's account reaches every child's record in the
   * school, so it matters more here, not less.
   */
  @Post(":userId/invitations")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Invite a member of staff to set up their own password",
    description:
      "Returns the one-time link, once. It is not stored and cannot be read back. Creating one cancels any " +
      "invitation to that person still outstanding.",
  })
  invite(@Param("userId") userId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invitations.invite(userId, { id: user.id });
  }

  @Get(":userId/invitations")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Every invitation sent to one member of staff" })
  listInvitations(@Param("userId") userId: string) {
    return this.invitations.forGuardian(userId);
  }

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

  // Before `:userId`, or "turnover" is read as a user id and every request
  // 404s — the same trap the module catalog route documents.
  @Get("turnover")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Who has left, by section, and what replacing them costs",
    description:
      "Somebody whose last day is still ahead is not counted: their resignation is in, but the post is not yet vacant and the school is still paying them.",
  })
  turnover() {
    return this.staff.turnover();
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
