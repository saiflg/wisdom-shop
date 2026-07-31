import { Controller, Get, Global, HttpCode, HttpStatus, Module, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { SearchService } from "./search.service";

@ApiTags("admin/search")
@ApiBearerAuth()
@Roles("ADMIN", "SUPER_ADMIN", "MANAGER")
@Controller("admin/search")
export class AdminSearchController {
  constructor(private readonly search: SearchService) {}

  @Get("status")
  @ApiOperation({ summary: "Whether search is configured and reachable" })
  status() {
    return { enabled: this.search.enabled };
  }

  @Post("reindex")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Rebuild the product index from the database",
    description:
      "Indexing happens automatically on product changes; this is for a fresh search volume or after a bulk import.",
  })
  reindex() {
    return this.search.reindexAll();
  }
}

/** Global so the catalog module can index without importing this one. */
@Global()
@Module({
  controllers: [AdminSearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
