import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../../auth/decorators/public.decorator";
import { ProductsService } from "./products.service";
import { QueryProductsDto } from "./dto/query-products.dto";

@ApiTags("products")
@Public()
@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  findAll(@Query() query: QueryProductsDto) {
    return this.products.findPublicList(query);
  }

  @Get(":slug")
  findBySlug(@Param("slug") slug: string) {
    return this.products.findPublicBySlug(slug);
  }
}
