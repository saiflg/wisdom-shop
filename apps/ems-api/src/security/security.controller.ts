import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { SecurityService } from "./security.service";

@ApiTags("security")
@ApiBearerAuth()
@Controller("security")
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  // Everybody signed in, and always about themselves. The service reads the
  // viewer's own id and never takes one from the request, so there is no
  // route here that can be pointed at another person's devices.
  @Get("sessions")
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @ApiOperation({
    summary: "The devices that can reach your account",
    description: "Your own only. Nobody, including an administrator, can read somebody else's devices here.",
  })
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.security.sessions(user);
  }

  @Delete("sessions/:id")
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @ApiOperation({
    summary: "End one of your own sessions",
    description: "Ending one that has already ended is reported, not refused.",
  })
  revoke(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.security.revoke(id, user);
  }

  @Post("sessions/revoke-all")
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Sign out everywhere, including here",
    description:
      "Not 'everywhere else': the access token carries no session id, so the server cannot tell which " +
      "session is asking. Signing everything out is the version that is true.",
  })
  revokeAll(@CurrentUser() user: AuthenticatedUser) {
    return this.security.revokeAll(user);
  }

  @Post("users/:userId/revoke-all")
  @Roles("SCHOOL_ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Shut somebody else's account out",
    description:
      "For a lost laptop or a compromised account. Returns a count and nothing else — no devices, no " +
      "addresses, no times.",
  })
  revokeAllFor(@Param("userId") userId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.security.revokeAllFor(userId, user);
  }
}
