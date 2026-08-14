import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "@/auth/decorators/public.decorator";
import { GuardianInvitationsService } from "./guardian-invitations.service";
import { AcceptInvitationDto, CheckInvitationDto } from "./dto/invitation.dto";

/**
 * The two routes a parent reaches before they have an account.
 *
 * Public by necessity — somebody following an invitation link cannot sign in
 * yet, because setting up signing in is the entire purpose of the link. So
 * both are throttled well below the global limit: these are the only routes
 * in the system where guessing a value repeatedly would be worth anything,
 * and a token is the one credential here that is not behind a login.
 *
 * POST for both, including the check. A token in a GET path is a token in
 * the access log, the proxy log and the browser history.
 */
@ApiTags("guardians")
@Public()
@Controller("invitations")
export class InvitationsController {
  constructor(private readonly invitations: GuardianInvitationsService) {}

  @Post("check")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: "Is this invitation link still good?",
    description:
      "Answers with the parent's first name so the page can greet them, and nothing else about the family, " +
      "the child or the school.",
  })
  check(@Body() dto: CheckInvitationDto) {
    return this.invitations.check(dto.schoolSlug, dto.token);
  }

  @Post("accept")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: "Set the password on a parent account",
    description:
      "The parent chooses it; the school never sees it. Single use, and any session opened with a password " +
      "the parent did not choose is revoked at the same moment.",
  })
  accept(@Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(dto.schoolSlug, dto.token, dto.password);
  }
}
