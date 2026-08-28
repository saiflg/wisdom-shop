import { Controller, Get, Param } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { StudentOverviewService } from "./student-overview.service";

@ApiTags("student-overview")
@ApiBearerAuth()
@Controller("student-overview")
export class StudentOverviewController {
  constructor(private readonly overview: StudentOverviewService) {}

  // Widened to families: one page showing where their child stands is most of
  // what a parent opens the portal for. The service decides who may see whom
  // and 404s for anybody else's child.
  @Get(":studentProfileId")
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @ApiOperation({
    summary: "Everything about one child, in one view",
    description:
      "Figures the school has no basis to state come back null rather than zero — a child with no registers " +
      "has no attendance rate. A family asking after another child gets a 404, not a 403.",
  })
  forStudent(@Param("studentProfileId") studentProfileId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.overview.forStudent(studentProfileId, user);
  }
}
