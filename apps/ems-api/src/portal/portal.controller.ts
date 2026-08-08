import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { PortalService } from "./portal.service";

/**
 * What a student or a family sees when they sign in.
 *
 * Deliberately not role-gated: staff may call it, and get an empty result
 * telling them so. The scoping is per-child and lives in the service.
 */
@ApiTags("portal")
@ApiBearerAuth()
@Controller("portal")
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get("children")
  @ApiOperation({ summary: "The students this viewer may see — themselves, or their children" })
  children(@CurrentUser() user: AuthenticatedUser) {
    return this.portal.children(user);
  }

  @Get("home")
  @ApiOperation({
    summary: "Everything one student's home page needs, in one request",
    description:
      "Today's lessons, homework due, recently released marks, attendance and fees. A guardian with " +
      "several children passes studentProfileId to switch; asking for a child who is not theirs is a 404.",
  })
  home(@CurrentUser() user: AuthenticatedUser, @Query("studentProfileId") studentProfileId?: string) {
    return this.portal.home(user, studentProfileId);
  }
}
