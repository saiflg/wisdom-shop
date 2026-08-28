import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { IdCardsService } from "./id-cards.service";

@ApiTags("id-cards")
@ApiBearerAuth()
@Controller("id-cards")
@Roles("SCHOOL_ADMIN", "TEACHER")
export class IdCardsController {
  constructor(private readonly cards: IdCardsService) {}

  /**
   * Staff only, and rendered as a PDF rather than a page.
   *
   * A web version would need every child's photograph at a URL a browser
   * could fetch. Embedding the bytes here keeps them inside an authenticated
   * response and off any address that could be shared, guessed, cached or
   * left in a history.
   */
  @Get()
  @ApiQuery({ name: "classId", required: true })
  @ApiOperation({
    summary: "Printable ID cards for a class",
    description:
      "Ten to a sheet. Photographs are embedded in the PDF — there is no URL for a child's photograph.",
  })
  async forClass(@Query("classId") classId: string, @Res() res: Response) {
    const { buffer, filename } = await this.cards.forClass(classId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
