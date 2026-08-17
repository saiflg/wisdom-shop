import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { AuditService } from "./audit.service";
import type { AuditCategory } from "./audit-log";

/**
 * Read-only, admin-only, and deliberately has no write route.
 *
 * A log a school can add to is a log a school can be argued into adding to.
 * Everything here comes from a trail written by the operation it describes.
 */
@ApiTags("audit")
@ApiBearerAuth()
@Roles("SCHOOL_ADMIN")
@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiQuery({ name: "q", required: false, description: "Matches the person, what they did, and why" })
  @ApiQuery({ name: "categories", required: false, description: "Comma-separated" })
  @ApiQuery({ name: "from", required: false })
  @ApiQuery({ name: "to", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiOperation({
    summary: "Who did what, and when",
    description:
      "Assembled from the trails the product already keeps rather than from a separate audit table — those " +
      "rows are written as part of the operation itself, so an attendance mark cannot be amended without the " +
      "amendment existing. Names are as recorded at the time, never resolved now.",
  })
  list(
    @Query("q") q?: string,
    @Query("categories") categories?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: string,
  ) {
    return this.audit.list({
      query: q,
      categories: categories
        ? (categories.split(",").map((value) => value.trim()).filter(Boolean) as AuditCategory[])
        : undefined,
      from: from ? new Date(from) : null,
      to: to ? new Date(to) : null,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
