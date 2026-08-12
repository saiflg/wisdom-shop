import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { GuardiansService } from "./guardians.service";
import { CreateGuardianDto } from "./dto/create-guardian.dto";

@ApiTags("guardians")
@ApiBearerAuth()
@Roles("SCHOOL_ADMIN")
@Controller("guardians")
export class GuardiansController {
  constructor(private readonly guardians: GuardiansService) {}

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

  @Delete(":linkId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Unlink a guardian from a student" })
  remove(@Param("linkId") linkId: string) {
    return this.guardians.remove(linkId);
  }
}
