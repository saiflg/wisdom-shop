import { Body, Controller, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { EnrollmentsService } from "./enrollments.service";
import { CreateEnrollmentDto } from "./dto/create-enrollment.dto";
import { UpdateEnrollmentDto } from "./dto/update-enrollment.dto";

@ApiTags("enrollments")
@ApiBearerAuth()
@Roles("SCHOOL_ADMIN", "TEACHER")
@Controller("enrollments")
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Post()
  @ApiOperation({ summary: "Enrol a student into a class" })
  create(@Body() dto: CreateEnrollmentDto) {
    return this.enrollments.create(dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Change an enrollment's status (withdraw/complete/reactivate)" })
  update(@Param("id") id: string, @Body() dto: UpdateEnrollmentDto) {
    return this.enrollments.update(id, dto);
  }
}
