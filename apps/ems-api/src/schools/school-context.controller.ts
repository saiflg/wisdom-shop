import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { SchoolModulesService } from "./school-modules.service";

/**
 * What the school console needs to know about its own school.
 *
 * Every signed-in role can read this, including students and guardians: the
 * sidebar has to know which sections exist before it can decide what to draw,
 * and which modules a school bought is not a secret from the people using it.
 *
 * It is not on the public branding route, though. That one is served to
 * anyone who can reach a login page, and a list of what a school has and has
 * not paid for is nobody else's business.
 */
@ApiTags("school")
@ApiBearerAuth()
@Controller("school")
export class SchoolContextController {
  constructor(private readonly modules: SchoolModulesService) {}

  @Get("modules")
  @ApiOperation({ summary: "The modules this school may use" })
  async myModules(@CurrentUser() user: AuthenticatedUser) {
    return { modules: await this.modules.modulesFor(user.schoolId) };
  }
}
