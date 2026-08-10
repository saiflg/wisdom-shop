import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { contentTypeFor } from "@/storage/storage";
import { MAX_PHOTO_BYTES } from "./photo-visibility";
import { PeopleService, type UploadedPhoto } from "./people.service";

@ApiTags("people")
@ApiBearerAuth()
@Controller("people")
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  /**
   * A person's photograph.
   *
   * Authenticated, and answered only for viewers allowed to see this
   * particular face — see photo-visibility.ts. Deliberately not a public
   * URL the way a school logo is: a logo is meant to be seen by strangers,
   * a child is not.
   *
   * `private` caching so a shared machine in a school library does not serve
   * one pupil's photograph out of the browser cache to the next person on it.
   */
  @Get(":userId/photo")
  @Header("Cache-Control", "private, max-age=300")
  @ApiOperation({ summary: "A person's photo, if you are allowed to see it" })
  async photo(
    @Param("userId") userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { key, stream } = await this.people.readPhoto(userId, user);
    res.setHeader("Content-Type", contentTypeFor(key));
    // Piped, exactly as the logo route does it. Returning the stream with
    // `passthrough: true` instead serialises the ReadStream object to JSON —
    // which is not merely a broken image, it publishes the server's absolute
    // filesystem path in the body.
    stream.pipe(res);
  }

  @Post(":userId/photo")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_PHOTO_BYTES } }))
  @ApiOperation({
    summary: "Set a person's photo",
    description: "Staff, or the person themselves. PNG, JPEG or WebP; SVG is refused because it can carry a script.",
  })
  setPhoto(
    @Param("userId") userId: string,
    @UploadedFile() file: UploadedPhoto | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.people.setPhoto(userId, file, user);
  }

  @Delete(":userId/photo")
  @ApiOperation({ summary: "Remove a person's photo" })
  removePhoto(@Param("userId") userId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.people.removePhoto(userId, user);
  }
}
