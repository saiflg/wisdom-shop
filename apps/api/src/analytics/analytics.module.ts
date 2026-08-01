import { Controller, Get, Module, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { SummaryQueryDto, TopProductsQueryDto } from "./dto/analytics-query.dto";
import { AnalyticsService } from "./analytics.service";

@ApiTags("admin/analytics")
@ApiBearerAuth()
@Roles("ADMIN", "SUPER_ADMIN", "MANAGER")
@Controller("admin/analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("summary")
  @ApiOperation({
    summary: "Headline figures for the admin overview",
    description:
      "Revenue counts only settled orders (PAID/PROCESSING/SHIPPED/DELIVERED/PARTIALLY_REFUNDED) — pending orders aren't paid for and cancelled/fully-refunded money went back. Gross and net are both reported: net subtracts settled refunds, so a partially refunded order counts for what was actually kept.",
  })
  summary(@Query() query: SummaryQueryDto) {
    return this.analytics.summary(query.days);
  }

  @Get("top-products")
  @ApiOperation({ summary: "Best-selling products by settled quantity" })
  topProducts(@Query() query: TopProductsQueryDto) {
    return this.analytics.topProducts(query.limit);
  }
}

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
