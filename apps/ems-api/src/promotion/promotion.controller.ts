import { Body, Controller, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";
import { PromotionService } from "./promotion.service";
import { PromotionRequestDto } from "./dto/promotion-request.dto";

/**
 * Moving the school up a year.
 *
 * Admin-only and deliberately not a teacher's power: this rewrites every
 * child's class in one action.
 *
 * Preview is a POST rather than a GET because it carries a whole mapping of
 * class decisions in its body — and because "preview" here means "compute
 * what would happen", not "fetch a resource".
 */
@ApiTags("promotion")
@ApiBearerAuth()
@Roles("SCHOOL_ADMIN")
@RequiresModule("STUDENTS")
@Controller("promotion")
export class PromotionController {
  constructor(private readonly promotion: PromotionService) {}

  @Post("preview")
  @ApiOperation({ summary: "What would happen to every student, changing nothing" })
  preview(@Body() dto: PromotionRequestDto) {
    return this.promotion.preview(dto);
  }

  @Post("apply")
  @ApiOperation({ summary: "Move every student up a year" })
  apply(@Body() dto: PromotionRequestDto) {
    return this.promotion.apply(dto);
  }
}
