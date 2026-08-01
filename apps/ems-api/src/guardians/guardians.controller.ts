import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
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
