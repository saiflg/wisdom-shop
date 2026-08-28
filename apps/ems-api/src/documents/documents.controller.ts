import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFile as UploadedFileParam,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { DocumentsService, type UploadedFile } from "./documents.service";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@ApiTags("documents")
@ApiBearerAuth()
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  // Widened to families: their own child's papers are theirs. The service
  // 404s for anybody else's child, and the storage key is never returned to
  // any client.
  @Get("students/:studentProfileId")
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @ApiOperation({
    summary: "Documents held for one child",
    description: "Labels and sizes only — the storage key is never sent to a client.",
  })
  list(@Param("studentProfileId") studentProfileId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.list(studentProfileId, user);
  }

  @Post("students/:studentProfileId")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiOperation({
    summary: "Attach a document to a child",
    description: "PDF, JPEG, PNG or WebP, up to 10 MB. An allow-list, not a block-list.",
  })
  upload(
    @Param("studentProfileId") studentProfileId: string,
    @Body("label") label: string,
    @UploadedFileParam() file: UploadedFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.upload(studentProfileId, label ?? "", file, user);
  }

  /**
   * The file itself.
   *
   * Streamed through this guarded route. There is no public URL for a child's
   * birth certificate anywhere in this system, and inline rendering is
   * refused — Content-Disposition is attachment, so a PDF a browser would
   * otherwise execute script inside is downloaded rather than opened in the
   * page's own origin.
   */
  @Get(":id/file")
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @ApiOperation({ summary: "Download a document" })
  async file(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const { stream, mimeType, label } = await this.documents.read(id, user);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${label.replace(/["\\]/g, "")}"`);
    // Belt and braces against a browser sniffing its way to something else.
    res.setHeader("X-Content-Type-Options", "nosniff");
    stream.pipe(res);
  }

  @Delete(":id")
  @Roles("SCHOOL_ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Withdraw a document",
    description: "Soft-deleted; the bytes are kept, because a file removed in error is a family's problem.",
  })
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.remove(id, user);
  }
}
