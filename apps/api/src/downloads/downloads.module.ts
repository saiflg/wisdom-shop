import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { StorageModule } from "../storage/storage.module";
import { DownloadsService } from "./downloads.service";
import { displayName } from "../storage/storage";
import type { UploadedFileLike } from "../storage/uploads.controller";
import type { AuthenticatedUser } from "../auth/interfaces/jwt-payload.interface";
import type { EnvConfig } from "../config/env.validation";

@ApiTags("admin/product-files")
@ApiBearerAuth()
@Roles("ADMIN", "SUPER_ADMIN", "MANAGER", "EDITOR")
@Controller("admin/products/:productId/files")
export class AdminProductFilesController {
  constructor(
    private readonly downloads: DownloadsService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Get()
  list(@Param("productId") productId: string) {
    return this.downloads.listForProduct(productId);
  }

  @Post()
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Attach a downloadable file to a product",
    description:
      "The file is never publicly addressable; customers reach it through /v1/downloads once their order is settled.",
  })
  @UseInterceptors(FileInterceptor("file"))
  async attach(
    @Param("productId") productId: string,
    @CurrentUser("id") actorUserId: string,
    @UploadedFile() file?: UploadedFileLike,
  ) {
    if (!file) throw new BadRequestException("No file was uploaded");

    const maxBytes = this.config.get("MAX_UPLOAD_MB", { infer: true }) * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(`That file is larger than the ${maxBytes / 1024 / 1024}MB limit`);
    }

    return this.downloads.attach(productId, file, actorUserId);
  }

  @Delete(":fileId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("fileId") fileId: string, @CurrentUser("id") actorUserId: string) {
    return this.downloads.remove(fileId, actorUserId);
  }
}

@ApiTags("downloads")
@ApiBearerAuth()
@Controller("downloads")
export class DownloadsController {
  constructor(private readonly downloads: DownloadsService) {}

  @Get()
  @ApiOperation({ summary: "Everything you have bought that has a file to download" })
  listMine(@CurrentUser("id") userId: string) {
    return this.downloads.listMine(userId);
  }

  @Get(":fileId")
  @ApiOperation({
    summary: "Download a purchased file",
    description:
      "403 when the product was never bought, or when the order that contains it is not settled.",
  })
  async download(
    @Param("fileId") fileId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const file = await this.downloads.openForUser(fileId, { id: user.id, roles: user.roles });

    // Always an attachment, never inline. Even a genuinely-PDF file would
    // otherwise render in the browser on this origin, and a mislabelled one
    // could render as HTML — the filename is sanitised for the same reason.
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${displayName(file.filename)}"`);
    res.setHeader("Content-Length", String(file.sizeBytes));
    // Purchased files are per-customer; no shared cache should keep a copy.
    res.setHeader("Cache-Control", "private, no-store");
    file.stream.pipe(res);
  }
}

@Module({
  imports: [StorageModule],
  controllers: [AdminProductFilesController, DownloadsController],
  providers: [DownloadsService],
  exports: [DownloadsService],
})
export class DownloadsModule {}
