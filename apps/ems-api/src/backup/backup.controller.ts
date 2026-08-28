import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { BackupService } from "./backup.service";

@ApiTags("backup")
@ApiBearerAuth()
@Controller("backup")
@Roles("SCHOOL_ADMIN")
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get("coverage")
  @ApiOperation({
    summary: "What a download would and would not contain",
    description:
      "Read before downloading. This is a copy of records, not a database backup, and what it leaves out is " +
      "listed rather than implied.",
  })
  coverage() {
    return this.backup.coverage();
  }

  @Get("download")
  @ApiOperation({
    summary: "One spreadsheet with a sheet per set of records",
    description: "Everything the coverage endpoint lists as included, in a single xlsx file.",
  })
  async download(@Res() res: Response) {
    const { buffer, filename } = await this.backup.download();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
