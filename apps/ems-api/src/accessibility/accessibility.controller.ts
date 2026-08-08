import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { AccessibilityService } from "./accessibility.service";
import { UpdateAccessibilityProfileDto } from "./dto/update-accessibility-profile.dto";

/**
 * Accessibility settings.
 *
 * Not role-gated as a whole: every student sets their own, which is the
 * point — needing larger text should not mean asking a teacher and waiting.
 * The distinctions live in the service, which has the data to enforce them.
 */
@ApiTags("accessibility")
@ApiBearerAuth()
@Controller("accessibility")
export class AccessibilityController {
  constructor(private readonly accessibility: AccessibilityService) {}

  @Get("me")
  @ApiOperation({ summary: "My own accessibility settings" })
  getOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.accessibility.getOwn(user);
  }

  @Put("me")
  @ApiOperation({
    summary: "Change my own settings",
    description: "The staff note is ignored here whatever is sent.",
  })
  updateOwn(@Body() dto: UpdateAccessibilityProfileDto, @CurrentUser() user: AuthenticatedUser) {
    return this.accessibility.updateOwn(dto, user);
  }

  @Get("users/:userId")
  @ApiOperation({
    summary: "Another user's settings",
    description:
      "Staff and the student's own guardians only. The staff note is returned to staff and to nobody else.",
  })
  getFor(@Param("userId") userId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.accessibility.getFor(userId, user);
  }

  @Put("users/:userId")
  @ApiOperation({ summary: "Set a student's settings on their behalf — staff only" })
  updateFor(
    @Param("userId") userId: string,
    @Body() dto: UpdateAccessibilityProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accessibility.updateFor(userId, dto, user);
  }
}
