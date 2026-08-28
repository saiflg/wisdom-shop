import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { AppraisalsService } from "./appraisals.service";
import { CreateAppraisalDto } from "./dto/create-appraisal.dto";
import { UpdateAppraisalDto } from "./dto/update-appraisal.dto";
import { TransitionAppraisalDto } from "./dto/transition-appraisal.dto";

/**
 * Staff only, top to bottom. An appraisal is an employment record, and no
 * family has any business in one.
 */
@ApiTags("appraisals")
@ApiBearerAuth()
@Controller("appraisals")
@Roles("SCHOOL_ADMIN", "TEACHER")
export class AppraisalsController {
  constructor(private readonly appraisals: AppraisalsService) {}

  @Post()
  @ApiOperation({
    summary: "Start an appraisal",
    description: "The reviewer is whoever is signed in, and they cannot be the person being appraised.",
  })
  create(@Body() dto: CreateAppraisalDto, @CurrentUser() user: AuthenticatedUser) {
    return this.appraisals.create(dto, user);
  }

  @Get()
  @ApiQuery({ name: "subjectUserId", required: false })
  @ApiOperation({
    summary: "Appraisals this person may see",
    description:
      "Your own once shared, the ones you wrote, or all of them if you are an administrator. A draft is " +
      "never visible to the person it is about.",
  })
  list(@CurrentUser() user: AuthenticatedUser, @Query("subjectUserId") subjectUserId?: string) {
    return this.appraisals.list(user, subjectUserId);
  }

  @Get(":id")
  @ApiOperation({
    summary: "One appraisal, with the moves this viewer can make",
    description: "A draft is a 404 for its subject, not a 403.",
  })
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.appraisals.findOne(id, user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Edit, while it is still a draft" })
  update(@Param("id") id: string, @Body() dto: UpdateAppraisalDto, @CurrentUser() user: AuthenticatedUser) {
    return this.appraisals.update(id, dto, user);
  }

  // The real check is checkTransition in the service, which holds the rule an
  // administrator cannot override: only the person being appraised may
  // acknowledge it.
  @Patch(":id/status")
  @ApiOperation({
    summary: "Share, acknowledge, or take back to draft",
    description:
      "Only the person being appraised can acknowledge it — not their reviewer, not an administrator, and " +
      "not on their behalf.",
  })
  transition(
    @Param("id") id: string,
    @Body() dto: TransitionAppraisalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appraisals.transition(id, dto, user);
  }
}
