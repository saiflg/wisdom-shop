import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { Public } from "@/auth/decorators/public.decorator";
import { Roles } from "@/auth/decorators/roles.decorator";
import { contentTypeFor } from "@/storage/storage";
import { BrandingService, type UploadedLogo } from "./branding.service";
import { UpdateBrandingDto } from "./dto/update-branding.dto";

@ApiTags("branding")
@Controller("branding")
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  /**
   * What the login page asks for before anyone has logged in.
   *
   * `req.hostname` rather than the raw `Host` header on purpose: Express
   * returns X-Forwarded-Host here when `trust proxy` is set, and this app
   * sets that from TRUST_PROXY_HOPS. Reading `headers.host` directly would
   * see the proxy's own internal hostname in every deployment that has one
   * — every school would get the fallback and nobody would find out until
   * production.
   *
   * `?schoolSlug=` is the fallback for a deployment with no base domain
   * configured, and for the shop's handoff links which carry the slug
   * explicitly. The host wins when it resolves: a page served from a
   * school's own address must not be talked into wearing another school's
   * name by a query parameter.
   */
  @Public()
  @Get("public")
  @ApiOperation({ summary: "Branding for the host (or an explicit slug), for the login page" })
  async publicBranding(@Req() req: Request, @Query("schoolSlug") schoolSlug?: string) {
    const byHost = await this.branding.getPublicForHost(req.hostname);
    if (byHost) return { resolvedFrom: "host" as const, branding: byHost };

    if (schoolSlug) {
      const bySlug = await this.branding.getPublicForSlug(schoolSlug);
      if (bySlug) return { resolvedFrom: "slug" as const, branding: bySlug };
    }

    // Not an error: the platform's own front door, an IP, or a school that
    // does not exist. The caller shows the default theme and asks which
    // school you mean — exactly what it did before branding existed.
    return { resolvedFrom: "none" as const, branding: null };
  }

  @Public()
  @Get("logo/:schoolSlug/:name")
  @Header("Cache-Control", "public, max-age=300")
  @ApiOperation({ summary: "Serve a school's logo" })
  async logo(
    @Param("schoolSlug") schoolSlug: string,
    @Param("name") name: string,
    @Res() res: Response,
  ) {
    const { stream } = await this.branding.openLogo(schoolSlug, name);
    res.setHeader("Content-Type", contentTypeFor(name));
    // Five minutes, not a year: unlike the shop's product images the URL
    // does change when a school replaces its logo, but an admin who has
    // just uploaded one should not have to explain a hard refresh to their
    // staff.
    stream.pipe(res);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: "This school's branding" })
  get() {
    return this.branding.getForCurrentSchool();
  }

  @Patch()
  @ApiBearerAuth()
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Update this school's name, tagline and colours" })
  update(@Body() dto: UpdateBrandingDto) {
    return this.branding.update(dto);
  }

  @Post("logo")
  @ApiBearerAuth()
  @Roles("SCHOOL_ADMIN")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Replace this school's logo" })
  @UseInterceptors(FileInterceptor("file"))
  uploadLogo(@UploadedFile() file?: UploadedLogo) {
    return this.branding.replaceLogo(file);
  }

  @Delete("logo")
  @ApiBearerAuth()
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Remove this school's logo" })
  removeLogo() {
    return this.branding.removeLogo();
  }
}
