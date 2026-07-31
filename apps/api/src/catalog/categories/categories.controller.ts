import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../../auth/decorators/public.decorator";
import { CategoriesService } from "./categories.service";

@ApiTags("categories")
@Public()
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  findTree() {
    return this.categories.findTree();
  }

  @Get(":slug")
  findBySlug(@Param("slug") slug: string) {
    return this.categories.findBySlug(slug);
  }
}
