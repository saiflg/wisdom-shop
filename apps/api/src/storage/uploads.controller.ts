import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  NotFoundException,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { StorageService } from "./storage.service";
import {
  ALLOWED_IMAGE_TYPES,
  buildStorageKey,
  IMAGE_PREFIX,
  isSafeStoredName,
  REJECTED_IMAGE_TYPES,
} from "./storage";
import type { EnvConfig } from "../config/env.validation";

/**
 * The shape multer gives us. Declared here rather than pulling in
 * `@types/multer` for four fields — multer itself already ships inside
 * `@nestjs/platform-express`, so no runtime dependency is added either.
 */
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags("uploads")
@ApiBearerAuth()
@Controller()
export class UploadsController {
  constructor(
    private readonly storage: StorageService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * Product imagery. Open to catalogue staff and to vendors, who need it for
   * their own listings.
   *
   * The stored content type comes from an allowlist, never from the upload:
   * a client that claims `image/png` and sends HTML would otherwise get that
   * HTML served back from our origin.
   */
  @Post("uploads/images")
  @Roles("ADMIN", "SUPER_ADMIN", "MANAGER", "EDITOR", "VENDOR")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Upload a product image and get back a public URL" })
  @UseInterceptors(FileInterceptor("file"))
  async uploadImage(@UploadedFile() file?: UploadedFileLike) {
    if (!file) throw new BadRequestException("No file was uploaded");

    if (REJECTED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        "SVG images are not accepted: they can carry scripts that would run on this site.",
      );
    }

    const extension = ALLOWED_IMAGE_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException(
        `Unsupported image type "${file.mimetype}". Use PNG, JPEG, WebP or GIF.`,
      );
    }

    const maxBytes = this.config.get("MAX_UPLOAD_MB", { infer: true }) * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(`That image is larger than the ${maxBytes / 1024 / 1024}MB limit`);
    }

    const key = buildStorageKey(IMAGE_PREFIX, extension);
    await this.storage.save(key, file.buffer);

    const name = key.slice(IMAGE_PREFIX.length + 1);
    return {
      url: `/v1/uploads/images/${name}`,
      contentType: file.mimetype,
      sizeBytes: file.size,
    };
  }

  /**
   * Serves an uploaded image. Public, because product imagery appears on
   * pages anyone can see.
   *
   * `nosniff` (set globally by helmet) plus an explicit content type from the
   * extension means the browser will not reinterpret these bytes as anything
   * executable, whatever they actually contain.
   */
  @Public()
  @Get("uploads/images/:name")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  async serveImage(@Param("name") name: string, @Res() res: Response) {
    // Checked before the filesystem is touched at all: only names this
    // service generated can pass, so traversal never reaches disk.
    if (!isSafeStoredName(name)) throw new NotFoundException("File not found");

    const extension = name.slice(name.lastIndexOf("."));
    const contentType =
      Object.entries(ALLOWED_IMAGE_TYPES).find(([, ext]) => ext === extension)?.[0] ??
      "application/octet-stream";

    const stream = await this.storage.readStream(`${IMAGE_PREFIX}/${name}`);
    res.setHeader("Content-Type", contentType);
    stream.pipe(res);
  }
}
