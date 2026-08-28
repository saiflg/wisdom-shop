import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { MedicalService } from "./medical.service";
import { CreateMedicalEntryDto } from "./dto/create-medical-entry.dto";

/**
 * There is no route here that lists across children, by design. A list of
 * every child in the school with a life-threatening allergy is a document
 * that should not exist in a school portal.
 */
@ApiTags("medical")
@ApiBearerAuth()
@Controller("medical")
export class MedicalController {
  constructor(private readonly medical: MedicalService) {}

  @Get("students/:studentProfileId")
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @ApiOperation({
    summary: "One child's medical record",
    description: "A family asking after another child gets a 404, not a 403.",
  })
  forStudent(@Param("studentProfileId") studentProfileId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.medical.forStudent(studentProfileId, user);
  }

  @Post("students/:studentProfileId")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Write something in a medical record",
    description: "An allergy or condition must carry a severity; nobody can judge that from the name alone.",
  })
  add(
    @Param("studentProfileId") studentProfileId: string,
    @Body() dto: CreateMedicalEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.medical.add(studentProfileId, dto, user);
  }

  @Post("entries/:id/archive")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Archive an entry",
    description:
      "There is no delete. A condition that turned out to be wrong is still part of a record somebody may " +
      "need to understand later.",
  })
  archive(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.medical.archive(id, user);
  }
}
