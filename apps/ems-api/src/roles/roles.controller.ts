import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { RolesService } from "./roles.service";

@ApiTags("roles")
@ApiBearerAuth()
@Controller("roles")
@Roles("SCHOOL_ADMIN")
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get("capabilities")
  @ApiOperation({
    summary: "What each role can actually reach",
    description:
      "Read from the running application's own route metadata — the same decorators the guards read — so it " +
      "cannot drift out of step with what is enforced.",
  })
  capabilities() {
    return this.roles.capabilities();
  }
}
