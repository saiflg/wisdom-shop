import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { GradingService } from "./grading.service";
import {
  CreateAssessmentDto,
  PublishResultsDto,
  RecordMarksDto,
  UpsertGradeScaleDto,
} from "./dto/grading.dto";

@ApiTags("grading")
@ApiBearerAuth()
@Controller("grading")
export class GradingController {
  constructor(private readonly grading: GradingService) {}

  @Get("scales")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "This school's grade scales" })
  listScales() {
    return this.grading.listScales();
  }

  @Post("scales")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Create a grade scale",
    description: "Bands must tile 0–100 with no gap or overlap, or a mark could fall into no grade at all.",
  })
  createScale(@Body() dto: UpsertGradeScaleDto) {
    return this.grading.createScale(dto);
  }

  @Put("scales/:id")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Replace a grade scale's bands",
    description: "Already-published report cards keep the grades they were issued with — those are snapshotted.",
  })
  updateScale(@Param("id") id: string, @Body() dto: UpsertGradeScaleDto) {
    return this.grading.updateScale(id, dto);
  }

  @Post("assessments")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Create an assessment for a subject in a class" })
  createAssessment(@Body() dto: CreateAssessmentDto) {
    return this.grading.createAssessment(dto);
  }

  @Get("assessments")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiQuery({ name: "classId", required: true })
  @ApiQuery({ name: "academicYear", required: true })
  @ApiQuery({ name: "term", required: true })
  @ApiOperation({ summary: "A class's assessments for a term, with marks" })
  listAssessments(
    @Query("classId") classId: string,
    @Query("academicYear") academicYear: string,
    @Query("term") term: string,
  ) {
    return this.grading.listAssessments(classId, academicYear, term);
  }

  @Delete("assessments/:id")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Retire an assessment" })
  deleteAssessment(@Param("id") id: string) {
    return this.grading.deleteAssessment(id);
  }

  @Post("assessments/:id/marks")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Record or correct marks",
    description:
      "Re-submitting corrects rather than duplicating. ABSENT counts as zero; EXCUSED is excluded and the " +
      "remaining weights are renormalised. Refused once results are published.",
  })
  recordMarks(@Param("id") id: string, @Body() dto: RecordMarksDto, @CurrentUser() user: AuthenticatedUser) {
    return this.grading.recordMarks(id, dto, user);
  }

  @Post("publish")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Compute and freeze a class's results for a term",
    description:
      "Refused while any mark is missing or any subject's weights do not total 100. Grades are snapshotted, so " +
      "editing the scale afterwards never changes an issued report card.",
  })
  publish(@Body() dto: PublishResultsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.grading.publish(dto, user);
  }

  @Post("unpublish")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Return a class's results to draft so marks can be corrected" })
  unpublish(@Body() dto: PublishResultsDto) {
    return this.grading.unpublish(dto);
  }

  @Get("results")
  @ApiQuery({ name: "classId", required: true })
  @ApiQuery({ name: "academicYear", required: true })
  @ApiQuery({ name: "term", required: true })
  @ApiOperation({ summary: "A class's results (staff only)" })
  listResults(
    @Query("classId") classId: string,
    @Query("academicYear") academicYear: string,
    @Query("term") term: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.grading.listResults(classId, academicYear, term, user);
  }

  @Get("report-cards/:studentProfileId")
  @ApiQuery({ name: "academicYear", required: true })
  @ApiQuery({ name: "term", required: true })
  @ApiOperation({
    summary: "One student's report card",
    description: "Families see published results only, and only their own children — anyone else gets a 404.",
  })
  reportCard(
    @Param("studentProfileId") studentProfileId: string,
    @Query("academicYear") academicYear: string,
    @Query("term") term: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.grading.reportCard(studentProfileId, academicYear, term, user);
  }
}
