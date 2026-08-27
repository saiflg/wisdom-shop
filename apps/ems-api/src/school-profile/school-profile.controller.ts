import { Body, Controller, Get, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { SchoolProfileService } from "./school-profile.service";
import { UpdateSchoolProfileDto } from "./dto/update-school-profile.dto";

@ApiTags("school-profile")
@ApiBearerAuth()
@Controller("school-profile")
export class SchoolProfileController {
  constructor(private readonly profile: SchoolProfileService) {}

  // Readable by anyone signed in: this is the address on the school's own
  // letterhead, not a secret. A parent looking up the school phone number in
  // the portal is the ordinary case.
  @Get()
  @ApiOperation({ summary: "The school's particulars" })
  get() {
    return this.profile.get();
  }

  @Get("document-header")
  @ApiOperation({
    summary: "The lines that head a printed document",
    description: "Name first, then whatever the school has actually filled in.",
  })
  header() {
    return this.profile.documentHeader();
  }

  @Patch()
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Update the school's particulars" })
  update(@Body() dto: UpdateSchoolProfileDto, @CurrentUser() user: AuthenticatedUser) {
    return this.profile.update(dto, user);
  }
}
