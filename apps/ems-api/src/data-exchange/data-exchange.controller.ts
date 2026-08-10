import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Roles } from "@/auth/decorators/roles.decorator";
import { DataExchangeService } from "./data-exchange.service";
import type { SheetFormat } from "./workbook";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";

/**
 * Typed structurally rather than via `Express.Multer.File`, which would mean
 * pulling in @types/multer for two fields.
 */
interface UploadedSheet {
  originalname: string;
  buffer: Buffer;
  size: number;
}

/** Large enough for a whole school's roster, small enough not to be a weapon. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

@ApiTags("data-exchange")
@ApiBearerAuth()
@RequiresModule("DATA_EXCHANGE")
@Controller("data")
export class DataExchangeController {
  constructor(private readonly data: DataExchangeService) {}

  @Get("entities")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "What can be imported and exported, and the columns each expects" })
  entities() {
    return this.data.listEntities();
  }

  @Get(":entity/template")
  @Roles("SCHOOL_ADMIN")
  @ApiQuery({ name: "format", enum: ["xlsx", "csv"], required: false })
  @ApiOperation({ summary: "An empty file with the right headers" })
  async template(
    @Param("entity") entity: string,
    @Query("format") format: SheetFormat = "xlsx",
    @Res() res: Response,
  ) {
    const buffer = await this.data.template(entity, this.checkFormat(format));
    this.send(res, buffer, `${entity}-template.${format}`, format);
  }

  @Get(":entity/export")
  @Roles("SCHOOL_ADMIN")
  @ApiQuery({ name: "format", enum: ["xlsx", "csv"], required: false })
  @ApiOperation({
    summary: "Export current records",
    description: "Staff exports carry masked account numbers only — the full value has its own audited route.",
  })
  async export(
    @Param("entity") entity: string,
    @Query("format") format: SheetFormat = "xlsx",
    @Res() res: Response,
  ) {
    const { buffer } = await this.data.export(entity, this.checkFormat(format));
    const stamp = new Date().toISOString().slice(0, 10);
    this.send(res, buffer, `${entity}-${stamp}.${format}`, format);
  }

  @Post(":entity/preview")
  @Roles("SCHOOL_ADMIN")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiOperation({
    summary: "What this file would do, without doing it",
    description:
      "Always call this first. Returns a per-row account of creates, updates and problems, with row numbers " +
      "as they appear in the spreadsheet. Nothing is written.",
  })
  preview(@Param("entity") entity: string, @UploadedFile() file: UploadedSheet) {
    this.checkFile(file);
    return this.data.plan(entity, file.originalname, file.buffer);
  }

  @Post(":entity/import")
  @Roles("SCHOOL_ADMIN")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiOperation({
    summary: "Carry out the import",
    description:
      "Rows with problems are skipped and reported rather than blocking the rest — one typo must not stop a " +
      "correct roster of four hundred. A file missing a required column is refused outright.",
  })
  import(@Param("entity") entity: string, @UploadedFile() file: UploadedSheet) {
    this.checkFile(file);
    return this.data.commit(entity, file.originalname, file.buffer);
  }

  private checkFile(file: UploadedSheet | undefined): asserts file is UploadedSheet {
    if (!file) throw new BadRequestException("No file was uploaded");
    if (!file.size) throw new BadRequestException("That file is empty");
  }

  private checkFormat(format: string): SheetFormat {
    if (format !== "xlsx" && format !== "csv") {
      throw new BadRequestException("Choose either xlsx or csv");
    }
    return format;
  }

  private send(res: Response, buffer: Buffer, filename: string, format: SheetFormat) {
    res.setHeader(
      "Content-Type",
      format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
