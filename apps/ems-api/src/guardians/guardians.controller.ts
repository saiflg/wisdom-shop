import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { GuardiansService } from "./guardians.service";
import { GuardianInvitationsService } from "./guardian-invitations.service";
import { CreateGuardianDto } from "./dto/create-guardian.dto";

@ApiTags("guardians")
@ApiBearerAuth()
@Roles("SCHOOL_ADMIN")
@Controller("guardians")
export class GuardiansController {
  constructor(
    private readonly guardians: GuardiansService,
    private readonly invitations: GuardianInvitationsService,
  ) {}

  // Readable by teachers as well as admins, unlike everything else on this
  // controller. Linking and unlinking a guardian decides who may see a child's
  // record and stays with the office; looking a parent up to telephone them is
  // ordinary teaching work.
  @Get()
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Every family in the school, one entry per guardian" })
  list() {
    return this.guardians.list();
  }

  // Admin-only, unlike the directory. This one aggregates fee debt and today's
  // absences across the whole school — a teacher has no business with either.
  @Get("overview")
  @ApiOperation({ summary: "What needs attention about families today" })
  overview() {
    return this.guardians.overview();
  }

  @Post()
  @ApiOperation({ summary: "Link a guardian (existing or new) to a student" })
  create(@Body() dto: CreateGuardianDto) {
    return this.guardians.create(dto);
  }

  @Post(":guardianUserId/invitations")
  @ApiOperation({
    summary: "Invite a parent to set up their own portal password",
    description:
      "Returns the one-time link, once. It is not stored and cannot be read back — if it is lost, send another. " +
      "Creating one cancels any invitation to that parent still outstanding.",
  })
  invite(@Param("guardianUserId") guardianUserId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invitations.invite(guardianUserId, { id: user.id });
  }

  @Get(":guardianUserId/invitations")
  @ApiOperation({
    summary: "Every invitation sent to one parent",
    description: "The tokens themselves are absent — only what happened to each invitation and when.",
  })
  listInvitations(@Param("guardianUserId") guardianUserId: string) {
    return this.invitations.forGuardian(guardianUserId);
  }

  // Declared before the :linkId route below, which would otherwise match
  // "invitations" as a link id and try to unlink a guardian that does not
  // exist. Nest matches in declaration order.
  @Delete("invitations/:invitationId")
  @ApiOperation({ summary: "Cancel an invitation that has not been used" })
  revokeInvitation(@Param("invitationId") invitationId: string) {
    return this.invitations.revoke(invitationId);
  }

  @Delete(":linkId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Unlink a guardian from a student" })
  remove(@Param("linkId") linkId: string) {
    return this.guardians.remove(linkId);
  }
}
