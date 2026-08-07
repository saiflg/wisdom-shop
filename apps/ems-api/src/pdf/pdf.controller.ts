import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { PdfService } from "./pdf.service";

@ApiTags("pdf")
@ApiBearerAuth()
@Controller("pdf")
export class PdfController {
  constructor(private readonly pdf: PdfService) {}

  @Get("report-cards/:studentProfileId")
  @ApiQuery({ name: "academicYear", required: true })
  @ApiQuery({ name: "term", required: true })
  @ApiOperation({
    summary: "A student's report card as a PDF",
    description:
      "Scoped by the same code as the JSON route: a family may print their own child's published card and " +
      "gets a 404 for anyone else's.",
  })
  async reportCard(
    @Param("studentProfileId") studentProfileId: string,
    @Query("academicYear") academicYear: string,
    @Query("term") term: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdf.reportCard(studentProfileId, academicYear, term, user);
    send(res, buffer, filename);
  }

  @Get("classes/:classId/list")
  @ApiOperation({ summary: "A class register sheet as a PDF (staff only)" })
  async classList(
    @Param("classId") classId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdf.classList(classId, user);
    send(res, buffer, filename);
  }

  @Get("classes/:classId/timetable")
  @ApiOperation({ summary: "A class timetable as a PDF" })
  async classTimetable(
    @Param("classId") classId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdf.classTimetable(classId, user);
    send(res, buffer, filename);
  }

  @Get("invoices/:invoiceId")
  @ApiOperation({
    summary: "A fee invoice as a PDF",
    description: "A family may print their own child's invoice and gets a 404 for any other.",
  })
  async invoice(
    @Param("invoiceId") invoiceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdf.invoice(invoiceId, user);
    send(res, buffer, filename);
  }
}

function send(res: Response, buffer: Buffer, filename: string) {
  res.setHeader("Content-Type", "application/pdf");
  // `inline` rather than `attachment`: a parent checking a report card on a
  // phone wants it to open, not land in a downloads folder they then have to
  // go and find.
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.send(buffer);
}
