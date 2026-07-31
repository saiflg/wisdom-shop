import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { Public } from "../auth/decorators/public.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ReviewsService } from "./reviews.service";
import type { AuthenticatedUser } from "../auth/interfaces/jwt-payload.interface";

class QueryReviewsDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;
}

class UpdateReviewDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;
}

@ApiTags("reviews")
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get("products/:slug/reviews")
  @ApiOperation({
    summary: "Reviews for a product, with the rating summary",
    description: "Returns the summary alongside the page so a product page needs one request, not two.",
  })
  list(@Param("slug") slug: string, @Query() query: QueryReviewsDto) {
    return this.reviews.listForProduct(slug, query);
  }

  @Get("products/:slug/reviews/me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Whether you may review this, and your existing review if any" })
  eligibility(@Param("slug") slug: string, @CurrentUser("id") userId: string) {
    return this.reviews.eligibility(slug, userId);
  }

  @Post("products/:slug/reviews")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Review a product you bought",
    description:
      "403 unless a settled order contains it; 409 if you have already reviewed it — edit that one instead.",
  })
  create(
    @Param("slug") slug: string,
    @CurrentUser("id") userId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(slug, userId, dto);
  }

  @Patch("reviews/:id")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Edit your own review" })
  update(
    @Param("id") id: string,
    @CurrentUser("id") userId: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviews.update(id, userId, dto);
  }

  @Delete("reviews/:id")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Remove a review",
    description: "Your own, or anyone's if you hold a moderating role.",
  })
  remove(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.reviews.remove(id, { id: actor.id, roles: actor.roles });
  }
}

@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
