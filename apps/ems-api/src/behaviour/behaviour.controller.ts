import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { BehaviourService } from "./behaviour.service";
import { CreateBehaviourRecordDto } from "./dto/create-behaviour-record.dto";
import { UpdateBehaviourRecordDto } from "./dto/update-behaviour-record.dto";

@ApiTags("behaviour")
@ApiBearerAuth()
@Controller("behaviour")
export class BehaviourController {
  constructor(private readonly behaviour: BehaviourService) {}

  @Post()
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Write down a merit or a concern" })
  create(@Body() dto: CreateBehaviourRecordDto, @CurrentUser() user: AuthenticatedUser) {
    return this.behaviour.create(dto, user);
  }

  // Widened deliberately: a family reading what the school has written about
  // their own child is the point. BehaviourService.forStudent 404s for
  // anybody asking after somebody else's child.
  //
  // There is no route that lists across children, by design — this data
  // would make a "best and worst behaved" ranking trivial and nobody should
  // build one.
  @Get("students/:studentProfileId")
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @ApiOperation({
    summary: "One child's record and what it adds up to",
    description: "A family asking after another child gets a 404, not a 403.",
  })
  forStudent(
    @Param("studentProfileId") studentProfileId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.behaviour.forStudent(studentProfileId, user);
  }

  @Patch(":id")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Amend a record; the amendment is visible" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateBehaviourRecordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.behaviour.update(id, dto, user);
  }

  @Delete(":id")
  @Roles("SCHOOL_ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Withdraw a record. Soft-delete only — it stops counting, it does not vanish." })
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.behaviour.remove(id, user);
  }
}
